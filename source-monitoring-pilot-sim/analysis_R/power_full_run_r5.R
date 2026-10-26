#!/usr/bin/env Rscript
# PILOT_A — power runner r5 (CODEX_TASK__PILOT_A_POWER_RUNNER_r5_FIX_v1)
# CANDIDATE · SYNTHETIC ONLY · corrects the r4 runner:
#   (1) production manifest = 144 units (48 cells x 3 conditions, NO sub-grid shortcut);
#   (2) REAL convergence diagnostics (calc.derivs=TRUE, warnings captured not
#       suppressed, optimizer codes, lme4 conv messages, max|gradient|, singularity
#       as separate status) with attempt-level logging for every model level;
#   (3) configuration-driven: all scientific values read+validated from
#       config/power_simulation.json (fail-fast); config+runner SHA-256 in every
#       unit meta; units skipped ONLY when hashes/RNG/requested/rows all match.
#
# Operational (non-scientific) constants kept in code: master seed, gradient
# tolerance (lme4 default 0.002), optimizer name, cores, output paths.
#
# Modes:
#   Rscript power_full_run_r5.R manifest <out_dir>
#   Rscript power_full_run_r5.R run <out_dir> <sims|config> <cores> [unit_ids...]
#   Rscript power_full_run_r5.R verify <out_dir> <unit_id> <sims_requested>
#   Rscript power_full_run_r5.R aggregate <out_dir>
#
# The full production run is: run <dir> config <cores>  (sims = n_simulations_full)
# THIS TASK DOES NOT EXECUTE THE PRODUCTION RUN.

suppressMessages({ library(lme4); library(jsonlite); library(parallel) })

MASTER_SEED <- 20260720          # operational
GRAD_TOL    <- 0.002             # lme4 default check.conv.grad tolerance
OPTIMIZER   <- "bobyqa"
RUNNER_PATH <- normalizePath(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]))
ROOT        <- dirname(dirname(RUNNER_PATH))
CFG_PATH    <- file.path(ROOT, "config", "power_simulation.json")

sha256 <- function(path) strsplit(system(paste("sha256sum", shQuote(path)), intern = TRUE), " ")[[1]][1]
CFG_HASH    <- sha256(CFG_PATH)
RUNNER_HASH <- sha256(RUNNER_PATH)
ENV_FP <- paste0(R.version.string, " | lme4 ", packageVersion("lme4"),
                 " | Matrix ", packageVersion("Matrix"), " | jsonlite ", packageVersion("jsonlite"))

# ---- 1. configuration: read + fail-fast validation -------------------------
cfg <- fromJSON(CFG_PATH)
need <- c("sesoi_delta_c", "sensitivity_only_delta_dprime", "alpha_one_sided",
          "test_trials_per_participant", "variance_grid", "n_per_group_grid",
          "attrition_sensitivity_rates", "n_simulations_full", "base_parameters")
miss <- setdiff(need, names(cfg))
if (length(miss)) stop("CONFIG INVALID — missing keys: ", paste(miss, collapse = ", "))
stopifnot(cfg$sesoi_delta_c > 0, cfg$sesoi_delta_c < 1,
          cfg$alpha_one_sided > 0, cfg$alpha_one_sided < 0.5,
          cfg$test_trials_per_participant == 100,
          cfg$test_trials_per_participant %% 2 == 0,
          length(cfg$variance_grid$sd_c_participant) >= 1,
          length(cfg$variance_grid$sd_dprime_participant) >= 1,
          length(cfg$variance_grid$sd_item_intercept) >= 1,
          length(cfg$n_per_group_grid) >= 1,
          all(cfg$n_per_group_grid > 0),
          length(cfg$attrition_sensitivity_rates) >= 1,
          all(cfg$attrition_sensitivity_rates >= 0 & cfg$attrition_sensitivity_rates < 1),
          cfg$n_simulations_full >= 1000,
          cfg$sensitivity_only_delta_dprime > 0,
          is.numeric(cfg$base_parameters$base_dprime), is.numeric(cfg$base_parameters$base_c))
# model-structure sanity: locked structure elements must be declared in config
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
                    attr  = cfg$attrition_sensitivity_rates)   # 48 cells from config

# ---- 2. production manifest: 48 x 3 = 144 units (complete control grid) ----
CONDS <- data.frame(cond = c("A_primary", "B_null", "C_sensitivity_only"),
                    dc = c(SESOI, 0, 0), dd = c(0, 0, DDSENS))
units <- do.call(rbind, lapply(seq_len(nrow(CONDS)), function(ci)
  data.frame(cond = CONDS$cond[ci], dc = CONDS$dc[ci], dd = CONDS$dd[ci],
             cell = seq_len(nrow(grid)))))
units$unit_id <- seq_len(nrow(units))                          # 144

RNGkind("L'Ecuyer-CMRG"); set.seed(MASTER_SEED)
streams <- vector("list", nrow(units)); s <- .Random.seed
for (k in seq_len(nrow(units))) { s <- nextRNGStream(s); streams[[k]] <- s }
stream_id <- vapply(streams, function(x) substr(paste(x[2:7], collapse = "-"), 1, 64), "")

FORM <- list(
  full = response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id),
  unc  = response_external ~ condition * source_truth + (1 + source_truth || participant_id) + (1 | item_id),
  int  = response_external ~ condition * source_truth + (1 | participant_id) + (1 | item_id))

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

# ---- 3. one model-level attempt with REAL diagnostics ----------------------
fit_attempt <- function(fm, d, level) {
  warns <- character(0); t0 <- proc.time()[["elapsed"]]
  m <- withCallingHandlers(
    tryCatch(glmer(fm, data = d, family = binomial(link = "probit"), nAGQ = 1L,
                   control = glmerControl(optimizer = OPTIMIZER,
                                          optCtrl = list(maxfun = 2e5),
                                          calc.derivs = TRUE)),
             error = function(e) e),
    warning = function(w) { warns <<- c(warns, conditionMessage(w)); invokeRestart("muffleWarning") })
  el <- proc.time()[["elapsed"]] - t0
  if (inherits(m, "error"))
    return(list(ok = FALSE, m = NULL, level = level, error = conditionMessage(m),
                opt_code = NA, conv_msgs = "", max_grad = NA, hess_ok = NA,
                singular = NA, elapsed = el, warns = warns, accepted = FALSE,
                reason = "fit_error"))
  opt_code <- tryCatch(m@optinfo$conv$opt, error = function(e) NA)
  lme4_msgs <- paste(unlist(m@optinfo$conv$lme4$messages), collapse = " | ")
  gr <- tryCatch(max(abs(m@optinfo$derivs$gradient)), error = function(e) NA)
  hess_ok <- tryCatch({ ev <- eigen(m@optinfo$derivs$Hessian, only.values = TRUE)$values
                        all(ev > 0) }, error = function(e) NA)
  sing <- tryCatch(isSingular(m, tol = 1e-4), error = function(e) TRUE)
  conv_ok <- (!is.na(opt_code) && opt_code == 0) &&
             (is.na(gr) || gr < GRAD_TOL) &&
             !grepl("failed to converge", lme4_msgs, ignore.case = TRUE)
  accepted <- conv_ok && !sing
  reason <- if (accepted) "" else if (sing && conv_ok) "singular"
            else if (!conv_ok && sing) "nonconverged_and_singular"
            else "nonconverged"
  list(ok = TRUE, m = m, level = level, error = "", opt_code = opt_code,
       conv_msgs = lme4_msgs, max_grad = gr, hess_ok = hess_ok, singular = sing,
       elapsed = el, warns = warns, accepted = accepted, reason = reason)
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
  res = file.path(out, "units", sprintf("unit_%03d.csv", uid)),
  att = file.path(out, "units", sprintf("unit_%03d_attempts.csv", uid)),
  meta = file.path(out, "units", sprintf("unit_%03d_meta.json", uid)))

unit_status <- function(out, uid, sims_req) {
  p <- unit_paths(out, uid)
  if (!file.exists(p$meta) || !file.exists(p$res)) return("MISSING")
  mt <- tryCatch(fromJSON(p$meta), error = function(e) NULL)
  if (is.null(mt)) return("META_UNREADABLE")
  if (!identical(mt$config_hash, CFG_HASH) || !identical(mt$runner_hash, RUNNER_HASH))
    return("HASH_MISMATCH")
  if (!identical(mt$rng_stream_id, stream_id[uid])) return("RNG_MISMATCH")
  if (!identical(as.integer(mt$sims_requested), as.integer(sims_req))) return("REQUEST_MISMATCH")
  n_rows <- tryCatch(nrow(read.csv(p$res)), error = function(e) -1)
  if (!identical(as.integer(n_rows), as.integer(sims_req))) return("INCOMPLETE")
  if (!identical(as.integer(mt$sims_completed), as.integer(sims_req))) return("INCOMPLETE")
  "COMPLETE"
}

run_unit <- function(uid, out, sims) {
  st <- unit_status(out, uid, sims)
  if (st == "COMPLETE") return(invisible("skipped_complete"))
  u <- units[uid, ]; g <- grid[u$cell, ]; p <- unit_paths(out, uid)
  assign(".Random.seed", streams[[uid]], envir = .GlobalEnv)
  wall0 <- Sys.time(); cpu0 <- sum(proc.time()[c("user.self","sys.self")])
  res <- vector("list", sims); att <- list(); ai <- 0
  for (s in seq_len(sims)) {
    d <- gen_data(g$n_grp, g$sd_c, g$sd_dp, g$sd_it, g$attr, u$dc, u$dd)
    chosen <- NULL; chosen_status <- "no_fit"
    for (lvl in names(FORM)) {
      a <- fit_attempt(FORM[[lvl]], d, lvl); ai <- ai + 1
      att[[ai]] <- data.frame(unit_id = uid, sim = s, level = lvl,
                              returned = a$ok, error_text = substr(a$error, 1, 160),
                              opt_code = a$opt_code, conv_msgs = substr(a$conv_msgs, 1, 160),
                              max_grad = a$max_grad, hess_ok = a$hess_ok,
                              singular = a$singular, elapsed_s = round(a$elapsed, 3),
                              n_warnings = length(a$warns),
                              warning_text = substr(paste(a$warns, collapse = " | "), 1, 160),
                              accepted = a$accepted, fallback_reason = a$reason)
      if (a$accepted) { chosen <- a; chosen_status <- "accepted"; break }
      if (lvl == "int" && a$ok) { chosen <- a; chosen_status <- paste0("degraded_", a$reason) }
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
  write.csv(do.call(rbind, res), p$res, row.names = FALSE)
  write.csv(do.call(rbind, att), p$att, row.names = FALSE)
  attdf <- do.call(rbind, att)
  write_json(list(unit_id = uid, condition = u$cond, cell = u$cell,
                  n_per_group = g$n_grp, sd_c = g$sd_c, sd_dprime = g$sd_dp,
                  sd_item = g$sd_it, attrition = g$attr,
                  generating_dc = u$dc, generating_dd = u$dd,
                  rng_stream_id = stream_id[uid], master_seed = MASTER_SEED,
                  config_hash = CFG_HASH, runner_hash = RUNNER_HASH,
                  environment = ENV_FP,
                  sims_requested = sims, sims_completed = sims,
                  wall_start = format(wall0), wall_end = format(wall1),
                  wall_seconds = round(as.numeric(difftime(wall1, wall0, units = "secs")), 2),
                  cpu_seconds = round(cpu1 - cpu0, 2),
                  fit_attempts_total = nrow(attdf),
                  attempts_full = sum(attdf$level == "full"),
                  attempts_unc = sum(attdf$level == "unc"),
                  attempts_int = sum(attdf$level == "int"),
                  warning_count = sum(attdf$n_warnings),
                  status = "COMPLETE"),
             p$meta, auto_unbox = TRUE, pretty = TRUE)
  invisible("ran")
}

# ---- dispatch --------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)
MODE <- args[[1]]; OUT <- args[[2]]
dir.create(file.path(OUT, "units"), recursive = TRUE, showWarnings = FALSE)

write_manifest <- function(out, sims) {
  mf <- cbind(units[, c("unit_id", "cond", "cell", "dc", "dd")],
              grid[units$cell, ], rng_stream_id = stream_id,
              config_hash = CFG_HASH, runner_hash = RUNNER_HASH,
              environment = ENV_FP, sims_requested = sims)
  mf$sims_completed <- vapply(mf$unit_id, function(u) {
    st <- unit_status(out, u, sims)
    if (st == "COMPLETE") sims else 0L }, 1L)
  mf$status <- vapply(mf$unit_id, function(u) unit_status(out, u, sims), "")
  write.csv(mf, file.path(out, "unit_manifest.csv"), row.names = FALSE)
  cat("manifest:", nrow(mf), "units ->", file.path(out, "unit_manifest.csv"), "\n")
}

if (MODE == "manifest") {
  write_manifest(OUT, SIMS_FULL)
} else if (MODE == "run") {
  sims <- if (args[[3]] == "config") SIMS_FULL else as.integer(args[[3]])
  cores <- as.integer(args[[4]])
  ids <- if (length(args) > 4) as.integer(args[5:length(args)]) else units$unit_id
  ids <- ids[order(-grid$n_grp[units$cell[ids]])]
  invisible(mclapply(ids, run_unit, out = OUT, sims = sims,
                     mc.cores = cores, mc.preschedule = FALSE))
  write_manifest(OUT, sims)
  cat("run finished for", length(ids), "units at sims =", sims, "\n")
} else if (MODE == "verify") {
  st <- unit_status(OUT, as.integer(args[[3]]), as.integer(args[[4]]))
  cat(st, "\n"); quit(status = ifelse(st == "COMPLETE", 0, 1))
} else if (MODE == "aggregate") {
  files <- list.files(file.path(OUT, "units"), pattern = "^unit_\\d+\\.csv$", full.names = TRUE)
  sims <- do.call(rbind, lapply(files, read.csv))
  afiles <- list.files(file.path(OUT, "units"), pattern = "_attempts\\.csv$", full.names = TRUE)
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
      fits_accepted_converged = sum(acc),
      fits_degraded = sum(ok & !acc), missing_estimates = sum(!ok),
      attempt_fit_errors = sum(!a$returned),
      attempt_nonconverged = sum(a$returned & !a$accepted & grepl("nonconv", a$fallback_reason)),
      attempt_singular = sum(a$returned & a$singular, na.rm = TRUE),
      attempt_grad_flagged = sum(a$returned & !is.na(a$max_grad) & a$max_grad >= GRAD_TOL),
      chosen_full = mean(x$level == "full"), chosen_unc = mean(x$level == "unc"),
      chosen_int = mean(x$level == "int"), chosen_none = mean(x$level == "NONE"),
      power_attempted_denom = p, mc_se = sqrt(p * (1 - p) / att_n),
      ci95_low = ci[1], ci95_high = ci[2],
      mean_dc_hat = mean(x$dc_hat[ok]), bias_dc = mean(x$dc_hat[ok]) - u$dc,
      rmse_dc = sqrt(mean((x$dc_hat[ok] - u$dc)^2)), mean_se = mean(x$se[ok]),
      coverage95 = mean(x$covered[ok]), mean_dd_hat = mean(x$dd_hat[ok])))
  }
  write.csv(cells, file.path(OUT, "cell_summary.csv"), row.names = FALSE)
  write.csv(atts, file.path(OUT, "attempt_diagnostics.csv"), row.names = FALSE)
  cat("aggregated", length(files), "units;", nrow(atts), "attempt rows\n")
}
