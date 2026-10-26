#!/usr/bin/env Rscript
# PILOT_A — power runner r6 (CODEX_TASK__PILOT_A_POWER_RUNNER_r6_HARDENING_v1)
# CANDIDATE · SYNTHETIC ONLY. Hardens r5:
#  A. STRICT gradient acceptance: is.finite(max_grad) && max_grad < tol;
#     statuses gradient_missing / gradient_nonfinite / gradient_above_tolerance.
#  B. Hessian + message enforcement; explicit (EMPTY by default) message
#     allow-list; full untruncated diagnostics persisted losslessly to JSONL.
#  C. Environment identity (R, lme4, Matrix, jsonlite, platform, BLAS, LAPACK)
#     enforced in unit verification -> ENVIRONMENT_MISMATCH.
#  D. Unit schema + SHA-256 checksum validation; ATOMIC completion (data files
#     renamed first, metadata renamed LAST as the completion marker).
#  E. Strict production `aggregate` (fails unless 144 units x 1000 sims all
#     COMPLETE) vs explicit `aggregate_partial` (production_complete=FALSE,
#     refuses any n recommendation).
#
# Modes:
#   manifest <out_dir>
#   run <out_dir> <sims|config> <cores> [unit_ids...]
#   verify <out_dir> <unit_id> <sims_requested>
#   aggregate <out_dir>              # STRICT production only
#   aggregate_partial <out_dir>      # smoke/incomplete, explicitly non-production
#   accepttest                       # built-in acceptance-rule injection cases

suppressMessages({ library(lme4); library(jsonlite); library(parallel) })

MASTER_SEED <- 20260720
GRAD_TOL    <- 0.002
OPTIMIZER   <- "bobyqa"
ALLOWED_MESSAGES <- character(0)   # reviewed allow-list: EMPTY -> every non-empty
                                   # lme4 conv/derivative message REJECTS the level.
RUNNER_PATH <- normalizePath(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]))
ROOT <- dirname(dirname(RUNNER_PATH))
CFG_PATH <- file.path(ROOT, "config", "power_simulation.json")

sha256_file <- function(p) strsplit(system(paste("sha256sum", shQuote(p)), intern = TRUE), " ")[[1]][1]
CFG_HASH <- sha256_file(CFG_PATH); RUNNER_HASH <- sha256_file(RUNNER_PATH)

.si <- sessionInfo()
ENV_FP <- paste0(R.version.string,
                 " | platform ", R.version$platform,
                 " | lme4 ", packageVersion("lme4"),
                 " | Matrix ", packageVersion("Matrix"),
                 " | jsonlite ", packageVersion("jsonlite"),
                 " | BLAS ", ifelse(length(.si$BLAS), .si$BLAS, "unknown"),
                 " | LAPACK ", ifelse(length(.si$LAPACK), .si$LAPACK, "unknown"),
                 " | La ", as.character(La_version()))

# ---- config (fail-fast, identical validation to r5) ------------------------
cfg <- fromJSON(CFG_PATH)
need <- c("sesoi_delta_c", "sensitivity_only_delta_dprime", "alpha_one_sided",
          "test_trials_per_participant", "variance_grid", "n_per_group_grid",
          "attrition_sensitivity_rates", "n_simulations_full", "base_parameters")
miss <- setdiff(need, names(cfg))
if (length(miss)) stop("CONFIG INVALID — missing keys: ", paste(miss, collapse = ", "))
stopifnot(cfg$sesoi_delta_c > 0, cfg$sesoi_delta_c < 1,
          cfg$alpha_one_sided > 0, cfg$alpha_one_sided < 0.5,
          cfg$test_trials_per_participant == 100,
          length(cfg$n_per_group_grid) >= 1, all(cfg$n_per_group_grid > 0),
          all(cfg$attrition_sensitivity_rates >= 0 & cfg$attrition_sensitivity_rates < 1),
          cfg$n_simulations_full >= 1000, cfg$sensitivity_only_delta_dprime > 0,
          is.numeric(cfg$base_parameters$base_dprime), is.numeric(cfg$base_parameters$base_c))
sx <- tolower(paste(unlist(cfg$structure), collapse = " ; "))
for (needle in c("participant random intercept", "random slope", "item random intercept", "counterbalancing"))
  if (!grepl(needle, sx)) stop("CONFIG INVALID — model structure missing: ", needle)

SESOI <- cfg$sesoi_delta_c; DDSENS <- cfg$sensitivity_only_delta_dprime
ALPHA <- cfg$alpha_one_sided; ZCRIT <- qnorm(1 - ALPHA)
NTRIALS <- cfg$test_trials_per_participant
BASE_D <- cfg$base_parameters$base_dprime; BASE_C <- cfg$base_parameters$base_c
SIMS_FULL <- cfg$n_simulations_full

grid <- expand.grid(sd_c  = cfg$variance_grid$sd_c_participant,
                    sd_dp = cfg$variance_grid$sd_dprime_participant,
                    sd_it = cfg$variance_grid$sd_item_intercept,
                    n_grp = cfg$n_per_group_grid,
                    attr  = cfg$attrition_sensitivity_rates)
CONDS <- data.frame(cond = c("A_primary", "B_null", "C_sensitivity_only"),
                    dc = c(SESOI, 0, 0), dd = c(0, 0, DDSENS))
units <- do.call(rbind, lapply(seq_len(nrow(CONDS)), function(ci)
  data.frame(cond = CONDS$cond[ci], dc = CONDS$dc[ci], dd = CONDS$dd[ci],
             cell = seq_len(nrow(grid)))))
units$unit_id <- seq_len(nrow(units))
UNITS_REQUIRED <- nrow(units)                       # 144

RNGkind("L'Ecuyer-CMRG"); set.seed(MASTER_SEED)
streams <- vector("list", nrow(units)); s <- .Random.seed
for (k in seq_len(nrow(units))) { s <- nextRNGStream(s); streams[[k]] <- s }
stream_id <- vapply(streams, function(x) substr(paste(x[2:7], collapse = "-"), 1, 64), "")

FORM <- list(
  full = response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id),
  unc  = response_external ~ condition * source_truth + (1 + source_truth || participant_id) + (1 | item_id),
  int  = response_external ~ condition * source_truth + (1 | participant_id) + (1 | item_id))

RESULT_COLS  <- c("unit_id","sim","fitted","level","status","singular",
                  "dc_hat","se","sig","dd_hat","covered")
ATTEMPT_COLS <- c("unit_id","sim","level","returned","error_preview","opt_code",
                  "conv_msgs_preview","max_grad","hess_ok","singular","elapsed_s",
                  "n_warnings","warning_preview","accepted","reject_reasons")
VALID_LEVELS <- c("full","unc","int","NONE")
VALID_STATUS_RE <- "^(accepted|degraded_.+|no_fit)$"

gen_data <- function(n_grp, sd_c, sd_dp, sd_it, attrition, dc, dd) {
  item_eff <- rnorm(NTRIALS, 0, sd_it); half <- NTRIALS / 2
  listA <- c(rep(1, half), rep(0, half)); rows <- vector("list", 2 * n_grp); k <- 0
  for (cond in c(0, 1)) for (j in seq_len(n_grp)) {
    k <- k + 1
    c_j <- rnorm(1, BASE_C + cond * dc, sd_c)
    d_j <- max(0.05, rnorm(1, BASE_D + cond * dd, sd_dp))
    truth <- if (j %% 2 == 0) listA else 1 - listA
    eta <- (-c_j - d_j / 2) + d_j * truth + item_eff
    rows[[k]] <- data.frame(participant_id = sprintf("S%d_%03d", cond, j),
                            condition = ifelse(cond == 1, "decentering", "active_control"),
                            item_id = sprintf("i%03d", seq_len(NTRIALS)),
                            source_truth = truth,
                            response_external = as.integer(runif(NTRIALS) < pnorm(eta)))
  }
  d <- do.call(rbind, rows)
  if (attrition > 0) {
    ids <- unique(d$participant_id)
    d <- d[d$participant_id %in% sample(ids, round((1 - attrition) * length(ids))), ]
  }
  d$condition <- factor(d$condition, levels = c("active_control", "decentering"))
  d$participant_id <- factor(d$participant_id); d$item_id <- factor(d$item_id)
  d
}

# ---- STRICT acceptance rule (pure function; unit-testable) -----------------
# accepted <=> returned & opt_code==0 & is.finite(gr) & gr<GRAD_TOL &
#              isTRUE(hess_ok) & no non-allow-listed conv message & !singular
evaluate_attempt <- function(returned, opt_code, gr, hess_ok, conv_msgs, singular) {
  reasons <- character(0)
  if (!returned) reasons <- c(reasons, "fit_error")
  else {
    if (is.na(opt_code) || opt_code != 0) reasons <- c(reasons, "optimizer_code_nonzero")
    if (is.null(gr) || length(gr) == 0 || is.na(gr)) reasons <- c(reasons, "gradient_missing")
    else if (!is.finite(gr)) reasons <- c(reasons, "gradient_nonfinite")
    else if (gr >= GRAD_TOL) reasons <- c(reasons, "gradient_above_tolerance")
    if (!isTRUE(hess_ok)) reasons <- c(reasons, "hessian_unacceptable")
    live_msgs <- setdiff(conv_msgs[nzchar(conv_msgs)], ALLOWED_MESSAGES)
    if (length(live_msgs) > 0) reasons <- c(reasons, "conv_message_present")
    if (isTRUE(singular)) reasons <- c(reasons, "singular")
    if (is.na(singular)) reasons <- c(reasons, "singularity_unknown")
  }
  list(accepted = length(reasons) == 0, reasons = reasons)
}

capture_fit <- function(expr) {
  warns <- character(0)
  val <- withCallingHandlers(
    tryCatch(expr, error = function(e) e),
    warning = function(w) { warns <<- c(warns, conditionMessage(w)); invokeRestart("muffleWarning") })
  list(value = val, warnings = warns)
}

fit_attempt <- function(fm, d, level) {
  t0 <- proc.time()[["elapsed"]]
  cap <- capture_fit(glmer(fm, data = d, family = binomial(link = "probit"), nAGQ = 1L,
                           control = glmerControl(optimizer = OPTIMIZER,
                                                  optCtrl = list(maxfun = 2e5),
                                                  calc.derivs = TRUE)))
  el <- proc.time()[["elapsed"]] - t0
  m <- cap$value
  if (inherits(m, "error")) {
    ev <- evaluate_attempt(FALSE, NA, NA, NA, character(0), NA)
    return(list(m = NULL, level = level, returned = FALSE,
                error_full = conditionMessage(m), opt_code = NA,
                conv_msgs = character(0), max_grad = NA, hess_ok = NA,
                singular = NA, elapsed = el, warns = cap$warnings,
                accepted = FALSE, reasons = ev$reasons))
  }
  opt_code <- tryCatch(m@optinfo$conv$opt, error = function(e) NA)
  msgs <- tryCatch(unlist(m@optinfo$conv$lme4$messages), error = function(e) character(0))
  if (is.null(msgs)) msgs <- character(0)
  gr <- tryCatch(max(abs(m@optinfo$derivs$gradient)), error = function(e) NA)
  hess_ok <- tryCatch({ ev <- eigen(m@optinfo$derivs$Hessian, only.values = TRUE)$values
                        isTRUE(all(is.finite(ev)) && all(ev > 0)) }, error = function(e) FALSE)
  sing <- tryCatch(isSingular(m, tol = 1e-4), error = function(e) NA)
  evl <- evaluate_attempt(TRUE, opt_code, gr, hess_ok, msgs, sing)
  list(m = m, level = level, returned = TRUE, error_full = "", opt_code = opt_code,
       conv_msgs = msgs, max_grad = gr, hess_ok = hess_ok, singular = sing,
       elapsed = el, warns = cap$warnings, accepted = evl$accepted, reasons = evl$reasons)
}

estimand <- function(m, gen_dc) {
  fe <- fixef(m); V <- as.matrix(vcov(m))
  L <- rep(0, length(fe)); names(L) <- names(fe)
  L["conditiondecentering"] <- -1; L["conditiondecentering:source_truth"] <- -0.5
  dc <- sum(L * fe); se <- sqrt(as.numeric(t(L) %*% V %*% L))
  list(dc = dc, se = se, sig = as.integer(dc / se > ZCRIT),
       dd = unname(fe[["conditiondecentering:source_truth"]]),
       covered = as.integer(abs(dc - gen_dc) <= 1.96 * se))
}

unit_paths <- function(out, uid) list(
  res  = file.path(out, "units", sprintf("unit_%03d.csv", uid)),
  att  = file.path(out, "units", sprintf("unit_%03d_attempts.csv", uid)),
  attj = file.path(out, "units", sprintf("unit_%03d_attempts_full.jsonl", uid)),
  meta = file.path(out, "units", sprintf("unit_%03d_meta.json", uid)))

# ---- hardened verifier ------------------------------------------------------
unit_status <- function(out, uid, sims_req) {
  p <- unit_paths(out, uid)
  if (!file.exists(p$meta)) return("MISSING")
  mt <- tryCatch(fromJSON(p$meta), error = function(e) NULL)
  if (is.null(mt)) return("META_UNREADABLE")
  if (!identical(mt$config_hash, CFG_HASH) || !identical(mt$runner_hash, RUNNER_HASH))
    return("HASH_MISMATCH")
  if (!identical(mt$environment, ENV_FP)) return("ENVIRONMENT_MISMATCH")
  if (!identical(mt$rng_stream_id, stream_id[uid])) return("RNG_MISMATCH")
  if (!identical(as.integer(mt$sims_requested), as.integer(sims_req))) return("REQUEST_MISMATCH")
  if (!file.exists(p$res)) return("RESULT_MISSING")
  if (!file.exists(p$att) || !file.exists(p$attj)) return("ATTEMPTS_MISSING")
  if (!identical(sha256_file(p$res), mt$result_sha256)) return("CHECKSUM_MISMATCH")
  if (!identical(sha256_file(p$att), mt$attempts_sha256)) return("CHECKSUM_MISMATCH")
  if (!identical(sha256_file(p$attj), mt$attempts_full_sha256)) return("CHECKSUM_MISMATCH")
  x <- tryCatch(read.csv(p$res), error = function(e) NULL)
  if (is.null(x)) return("SCHEMA_MISMATCH")
  if (!identical(colnames(x), RESULT_COLS)) return("SCHEMA_MISMATCH")
  a <- tryCatch(read.csv(p$att), error = function(e) NULL)
  if (is.null(a) || !identical(colnames(a), ATTEMPT_COLS)) return("SCHEMA_MISMATCH")
  if (any(x$unit_id != uid) || any(a$unit_id != uid)) return("UNIT_ID_MISMATCH")
  if (!identical(sort(x$sim), seq_len(sims_req)) || anyDuplicated(x$sim) > 0)
    return("SIMULATION_INDEX_MISMATCH")
  if (!all(x$level %in% VALID_LEVELS) || !all(grepl(VALID_STATUS_RE, x$status)))
    return("SCHEMA_MISMATCH")
  if (!identical(as.integer(mt$sims_completed), as.integer(sims_req))) return("INCOMPLETE")
  "COMPLETE"
}

run_unit <- function(uid, out, sims) {
  if (unit_status(out, uid, sims) == "COMPLETE") return(invisible("skipped_complete"))
  u <- units[uid, ]; g <- grid[u$cell, ]; p <- unit_paths(out, uid)
  assign(".Random.seed", streams[[uid]], envir = .GlobalEnv)
  wall0 <- Sys.time(); cpu0 <- sum(proc.time()[c("user.self","sys.self")])
  res <- vector("list", sims); att <- list(); jl <- character(0); ai <- 0
  for (s in seq_len(sims)) {
    d <- gen_data(g$n_grp, g$sd_c, g$sd_dp, g$sd_it, g$attr, u$dc, u$dd)
    chosen <- NULL; chosen_status <- "no_fit"
    for (lvl in names(FORM)) {
      a <- fit_attempt(FORM[[lvl]], d, lvl); ai <- ai + 1
      att[[ai]] <- data.frame(unit_id = uid, sim = s, level = lvl,
                              returned = a$returned,
                              error_preview = substr(a$error_full, 1, 160),
                              opt_code = a$opt_code,
                              conv_msgs_preview = substr(paste(a$conv_msgs, collapse=" | "), 1, 160),
                              max_grad = a$max_grad, hess_ok = a$hess_ok,
                              singular = a$singular, elapsed_s = round(a$elapsed, 3),
                              n_warnings = length(a$warns),
                              warning_preview = substr(paste(a$warns, collapse=" | "), 1, 160),
                              accepted = a$accepted,
                              reject_reasons = paste(a$reasons, collapse = ";"))
      jl <- c(jl, toJSON(list(unit_id = uid, sim = s, level = lvl,
                              returned = a$returned, error_full = a$error_full,
                              opt_code = a$opt_code, conv_msgs_full = a$conv_msgs,
                              warnings_full = a$warns, max_grad = a$max_grad,
                              hess_ok = a$hess_ok, singular = a$singular,
                              accepted = a$accepted, reject_reasons = a$reasons),
                         auto_unbox = TRUE, digits = 8, null = "null"))
      if (a$accepted) { chosen <- a; chosen_status <- "accepted"; break }
      if (lvl == "int" && a$returned) {
        chosen <- a
        chosen_status <- paste0("degraded_", paste(a$reasons, collapse = "+"))
      }
    }
    if (is.null(chosen)) {
      res[[s]] <- data.frame(unit_id = uid, sim = s, fitted = 0, level = "NONE",
                             status = "no_fit", singular = NA, dc_hat = NA, se = NA,
                             sig = 0, dd_hat = NA, covered = NA)
    } else {
      e <- estimand(chosen$m, u$dc)
      res[[s]] <- data.frame(unit_id = uid, sim = s, fitted = 1, level = chosen$level,
                             status = chosen_status, singular = chosen$singular,
                             dc_hat = e$dc, se = e$se, sig = e$sig, dd_hat = e$dd,
                             covered = e$covered)
    }
  }
  wall1 <- Sys.time(); cpu1 <- sum(proc.time()[c("user.self","sys.self")])
  attdf <- do.call(rbind, att)
  # ---- ATOMIC completion: tmp data -> hash -> tmp meta -> rename data -> meta LAST
  tr <- paste0(p$res, ".tmp"); ta <- paste0(p$att, ".tmp")
  tj <- paste0(p$attj, ".tmp"); tm <- paste0(p$meta, ".tmp")
  write.csv(do.call(rbind, res), tr, row.names = FALSE)
  write.csv(attdf, ta, row.names = FALSE)
  writeLines(jl, tj)
  meta <- list(unit_id = uid, condition = u$cond, cell = u$cell,
               n_per_group = g$n_grp, sd_c = g$sd_c, sd_dprime = g$sd_dp,
               sd_item = g$sd_it, attrition = g$attr,
               generating_dc = u$dc, generating_dd = u$dd,
               rng_stream_id = stream_id[uid], master_seed = MASTER_SEED,
               config_hash = CFG_HASH, runner_hash = RUNNER_HASH,
               environment = ENV_FP,
               sims_requested = sims, sims_completed = sims,
               result_sha256 = sha256_file(tr), attempts_sha256 = sha256_file(ta),
               attempts_full_sha256 = sha256_file(tj),
               wall_start = format(wall0), wall_end = format(wall1),
               wall_seconds = round(as.numeric(difftime(wall1, wall0, units = "secs")), 2),
               cpu_seconds = round(cpu1 - cpu0, 2),
               fit_attempts_total = nrow(attdf),
               attempts_full = sum(attdf$level == "full"),
               attempts_unc = sum(attdf$level == "unc"),
               attempts_int = sum(attdf$level == "int"),
               warning_count = sum(attdf$n_warnings),
               status = "COMPLETE")
  write_json(meta, tm, auto_unbox = TRUE, pretty = TRUE)
  file.rename(tr, p$res); file.rename(ta, p$att); file.rename(tj, p$attj)
  file.rename(tm, p$meta)                       # completion marker LAST
  invisible("ran")
}

verify_detail <- function(out, uid, sims_req) {
  st <- unit_status(out, uid, sims_req)
  p <- unit_paths(out, uid)
  comp <- if (file.exists(p$res))
    tryCatch(nrow(read.csv(p$res)), error = function(e) 0) else 0
  mt <- tryCatch(fromJSON(p$meta), error = function(e) NULL)
  env_st <- if (is.null(mt)) "NO_META" else if (identical(mt$environment, ENV_FP)) "MATCH" else "MISMATCH"
  ck_res <- if (is.null(mt) || !file.exists(p$res)) "N/A"
            else if (identical(sha256_file(p$res), mt$result_sha256)) "MATCH" else "MISMATCH"
  ck_att <- if (is.null(mt) || !file.exists(p$att)) "N/A"
            else if (identical(sha256_file(p$att), mt$attempts_sha256)) "MATCH" else "MISMATCH"
  sch <- if (!file.exists(p$res)) "N/A" else {
    x <- tryCatch(read.csv(p$res), error = function(e) NULL)
    if (!is.null(x) && identical(colnames(x), RESULT_COLS)) "MATCH" else "MISMATCH" }
  data.frame(unit_id = uid, verification_status = st, environment_status = env_st,
             result_checksum_status = ck_res, attempt_checksum_status = ck_att,
             schema_status = sch, sims_completed = comp)
}

write_manifest <- function(out, sims_req, label) {
  vd <- do.call(rbind, lapply(units$unit_id, verify_detail, out = out, sims_req = sims_req))
  mf <- cbind(units[, c("unit_id", "cond", "cell", "dc", "dd")],
              grid[units$cell, ], rng_stream_id = stream_id,
              sims_requested = sims_req)
  mf <- merge(mf, vd, by = "unit_id")
  write.csv(mf, file.path(out, "unit_manifest.csv"), row.names = FALSE)
  scounts <- table(mf$verification_status)
  n_complete <- sum(mf$verification_status == "COMPLETE")
  sims_complete <- sum(mf$sims_completed[mf$verification_status == "COMPLETE"])
  rm_json <- list(label = label, production_complete = (n_complete == UNITS_REQUIRED &&
                                                        sims_req == SIMS_FULL &&
                                                        sims_complete == UNITS_REQUIRED * SIMS_FULL),
                  units_complete = n_complete, units_required = UNITS_REQUIRED,
                  simulations_complete = sims_complete,
                  simulations_required = UNITS_REQUIRED * SIMS_FULL,
                  config_hash = CFG_HASH, runner_hash = RUNNER_HASH,
                  expected_environment = ENV_FP,
                  status_counts = as.list(scounts),
                  note = "CANDIDATE; no n recommendation is issued by this artifact")
  write_json(rm_json, file.path(out, "run_manifest.json"), auto_unbox = TRUE, pretty = TRUE)
  list(mf = mf, summary = rm_json)
}

aggregate_cells <- function(out, sims_req, suffix) {
  files <- list.files(file.path(out, "units"), pattern = "^unit_\\d+\\.csv$", full.names = TRUE)
  sims <- do.call(rbind, lapply(files, read.csv))
  afiles <- list.files(file.path(out, "units"), pattern = "_attempts\\.csv$", full.names = TRUE)
  atts <- do.call(rbind, lapply(afiles, read.csv))
  cells <- data.frame()
  for (uid in sort(unique(sims$unit_id))) {
    u <- units[uid, ]; g <- grid[u$cell, ]
    x <- sims[sims$unit_id == uid, ]; a <- atts[atts$unit_id == uid, ]
    att_n <- nrow(x); ok <- x$fitted == 1; acc <- x$status == "accepted"
    hits <- sum(x$sig); p <- hits / att_n; ci <- binom.test(hits, att_n)$conf.int
    cells <- rbind(cells, data.frame(
      unit_id = uid, condition = u$cond, n_per_group = g$n_grp, sd_c = g$sd_c,
      sd_dprime = g$sd_dp, sd_item = g$sd_it, attrition = g$attr,
      generating_dc = u$dc, generating_dd = u$dd,
      sims_attempted = att_n, fits_completed = sum(ok),
      fits_accepted_converged = sum(acc), fits_degraded = sum(ok & !acc),
      missing_estimates = sum(!ok),
      attempt_fit_errors = sum(!a$returned),
      attempt_rejected = sum(a$returned & !a$accepted),
      attempt_gradient_missing = sum(grepl("gradient_missing", a$reject_reasons)),
      attempt_gradient_nonfinite = sum(grepl("gradient_nonfinite", a$reject_reasons)),
      attempt_gradient_above_tol = sum(grepl("gradient_above_tolerance", a$reject_reasons)),
      attempt_hessian_bad = sum(grepl("hessian_unacceptable", a$reject_reasons)),
      attempt_msg_present = sum(grepl("conv_message_present", a$reject_reasons)),
      attempt_singular = sum(grepl("singular", a$reject_reasons)),
      chosen_full = mean(x$level == "full"), chosen_unc = mean(x$level == "unc"),
      chosen_int = mean(x$level == "int"), chosen_none = mean(x$level == "NONE"),
      power_attempted_denom = p, mc_se = sqrt(p * (1 - p) / att_n),
      ci95_low = ci[1], ci95_high = ci[2],
      mean_dc_hat = mean(x$dc_hat[ok]), bias_dc = mean(x$dc_hat[ok]) - u$dc,
      rmse_dc = sqrt(mean((x$dc_hat[ok] - u$dc)^2)), mean_se = mean(x$se[ok]),
      coverage95 = mean(x$covered[ok]), mean_dd_hat = mean(x$dd_hat[ok])))
  }
  write.csv(cells, file.path(out, paste0("cell_summary", suffix, ".csv")), row.names = FALSE)
  write.csv(atts, file.path(out, "attempt_diagnostics.csv"), row.names = FALSE)
  jfiles <- list.files(file.path(out, "units"), pattern = "_attempts_full\\.jsonl$", full.names = TRUE)
  writeLines(unlist(lapply(jfiles, readLines)), file.path(out, "attempt_diagnostics_full.jsonl"))
  cells
}

args <- commandArgs(trailingOnly = TRUE)
MODE <- args[[1]]

if (MODE == "accepttest") {
  cases <- list(
    list(nm="clean_accept",        a=evaluate_attempt(TRUE, 0, 0.0005, TRUE, character(0), FALSE), want=TRUE,  reason=""),
    list(nm="gradient_missing",    a=evaluate_attempt(TRUE, 0, NA, TRUE, character(0), FALSE),      want=FALSE, reason="gradient_missing"),
    list(nm="gradient_nonfinite",  a=evaluate_attempt(TRUE, 0, Inf, TRUE, character(0), FALSE),     want=FALSE, reason="gradient_nonfinite"),
    list(nm="gradient_above_tol",  a=evaluate_attempt(TRUE, 0, 0.5, TRUE, character(0), FALSE),     want=FALSE, reason="gradient_above_tolerance"),
    list(nm="hessian_bad",         a=evaluate_attempt(TRUE, 0, 0.0005, FALSE, character(0), FALSE), want=FALSE, reason="hessian_unacceptable"),
    list(nm="conv_message",        a=evaluate_attempt(TRUE, 0, 0.0005, TRUE, "Model failed to converge with max|grad|", FALSE), want=FALSE, reason="conv_message_present"),
    list(nm="optimizer_nonzero",   a=evaluate_attempt(TRUE, 1, 0.0005, TRUE, character(0), FALSE),  want=FALSE, reason="optimizer_code_nonzero"),
    list(nm="singular",            a=evaluate_attempt(TRUE, 0, 0.0005, TRUE, character(0), TRUE),   want=FALSE, reason="singular"))
  okall <- TRUE
  for (cse in cases) {
    got <- cse$a$accepted; rs <- paste(cse$a$reasons, collapse = ";")
    pass <- (got == cse$want) && (cse$reason == "" || grepl(cse$reason, rs))
    okall <- okall && pass
    cat(sprintf("[%s] %s accepted=%s reasons=%s\n", ifelse(pass,"PASS","FAIL"), cse$nm, got, rs))
  }
  wc <- capture_fit({ warning("synthetic-warning-proof"); 42 })
  wok <- (wc$value == 42) && (length(wc$warnings) == 1) && grepl("synthetic-warning-proof", wc$warnings)
  cat(sprintf("[%s] warning_capture n=%d text_ok=%s\n", ifelse(wok,"PASS","FAIL"), length(wc$warnings), wok))
  quit(status = ifelse(okall && wok, 0, 1))
}

OUT <- args[[2]]
dir.create(file.path(OUT, "units"), recursive = TRUE, showWarnings = FALSE)

if (MODE == "manifest") {
  write_manifest(OUT, SIMS_FULL, "production_manifest")
  cat("manifest:", UNITS_REQUIRED, "units\n")
} else if (MODE == "run") {
  sims <- if (args[[3]] == "config") SIMS_FULL else as.integer(args[[3]])
  cores <- as.integer(args[[4]])
  ids <- if (length(args) > 4) as.integer(args[5:length(args)]) else units$unit_id
  ids <- ids[order(-grid$n_grp[units$cell[ids]])]
  invisible(mclapply(ids, run_unit, out = OUT, sims = sims,
                     mc.cores = cores, mc.preschedule = FALSE))
  cat("run finished for", length(ids), "units at sims =", sims, "\n")
} else if (MODE == "verify") {
  st <- unit_status(OUT, as.integer(args[[3]]), as.integer(args[[4]]))
  cat(st, "\n"); quit(status = ifelse(st == "COMPLETE", 0, 1))
} else if (MODE == "aggregate") {
  wm <- write_manifest(OUT, SIMS_FULL, "strict_production_aggregate")
  bad <- wm$mf[wm$mf$verification_status != "COMPLETE", ]
  if (nrow(bad) > 0 || !wm$summary$production_complete) {
    cat("STRICT AGGREGATE REFUSED: production incomplete.\n")
    cat("units_complete=", wm$summary$units_complete, "/", UNITS_REQUIRED,
        "; simulations_complete=", wm$summary$simulations_complete, "/",
        UNITS_REQUIRED * SIMS_FULL, "\n", sep = "")
    print(table(wm$mf$verification_status))
    quit(status = 1)
  }
  aggregate_cells(OUT, SIMS_FULL, "")
  cat("STRICT aggregate complete: production_complete=TRUE\n")
} else if (MODE == "aggregate_partial") {
  sims_req <- if (length(args) >= 3) as.integer(args[[3]]) else SIMS_FULL
  wm <- write_manifest(OUT, sims_req, "partial_aggregate")
  cells <- aggregate_cells(OUT, sims_req, "_partial")
  wm$summary$production_complete <- FALSE
  wm$summary$note <- paste("PARTIAL/SMOKE aggregation — production_complete=FALSE;",
                           "NO n recommendation is or may be derived from this artifact.")
  write_json(wm$summary, file.path(OUT, "run_manifest.json"), auto_unbox = TRUE, pretty = TRUE)
  cat("PARTIAL aggregate:", nrow(cells), "units; production_complete=FALSE\n")
}
