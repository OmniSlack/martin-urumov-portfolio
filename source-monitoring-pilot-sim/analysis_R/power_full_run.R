#!/usr/bin/env Rscript
# PILOT_A — FULL POWER RUN executor (CODEX_TASK__PILOT_A_FULL_POWER_RUN_v1)
# CANDIDATE · SYNTHETIC ONLY · Laplace (nAGQ=1) · locked model + hierarchy.
# NEW FILE — does not modify any existing archive file or the lock's meaning.
#
# Conditions: A primary (dc=0.20, dd=0) all 48 cells;
#             B null (dc=0, dd=0) and C sensitivity-only (dc=0, dd=0.50)
#             on a PRESPECIFIED 12-cell sub-grid (n in {40,100}, attrition 0).
# Deterministic L'Ecuyer-CMRG stream per unit (cell x condition); per-unit
# incremental CSV output; failed fits retained in denominators and logged.
#
# Usage:
#   Rscript power_full_run.R run <sims_per_cell> <out_dir> [unit_ids...]
#   Rscript power_full_run.R aggregate <sims_per_cell> <out_dir>

suppressMessages({ library(lme4); library(jsonlite); library(parallel) })

MASTER_SEED <- 20260720
BASE_D <- 1.0; SESOI <- 0.20; DD_SENS <- 0.50
ZCRIT <- qnorm(0.95)  # one-sided alpha 0.05
N_TRIALS <- 100
LOCK_REQUIRED_SIMS <- 1000

args <- commandArgs(trailingOnly = TRUE)
MODE <- args[[1]]; SIMS <- as.integer(args[[2]]); OUT <- args[[3]]
dir.create(file.path(OUT, "units"), recursive = TRUE, showWarnings = FALSE)

grid <- expand.grid(sd_c = c(0.15, 0.25, 0.35), sd_dp = 0.25,
                    sd_item = c(0.10, 0.25), n_grp = c(40, 60, 80, 100),
                    attr = c(0.0, 0.10))            # 48 cells (config order)
subgrid_idx <- which(grid$attr == 0 & grid$n_grp %in% c(40, 100))  # 12 cells

units <- rbind(
  data.frame(cond_label = "A_primary", cell = seq_len(nrow(grid)), dc = SESOI, dd = 0),
  data.frame(cond_label = "B_null",    cell = subgrid_idx,          dc = 0,     dd = 0),
  data.frame(cond_label = "C_sensonly",cell = subgrid_idx,          dc = 0,     dd = DD_SENS)
)
units$unit_id <- seq_len(nrow(units))                # 48+12+12 = 72 units

# --- deterministic streams -------------------------------------------------
RNGkind("L'Ecuyer-CMRG"); set.seed(MASTER_SEED)
streams <- vector("list", nrow(units)); s <- .Random.seed
for (k in seq_len(nrow(units))) { s <- nextRNGStream(s); streams[[k]] <- s }

FORM <- list(
  full  = response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id),
  unc   = response_external ~ condition * source_truth + (1 + source_truth || participant_id) + (1 | item_id),
  int   = response_external ~ condition * source_truth + (1 | participant_id) + (1 | item_id)
)

gen_data <- function(n_grp, sd_c, sd_dp, sd_item, attrition, dc, dd) {
  item_eff <- rnorm(N_TRIALS, 0, sd_item)
  half <- N_TRIALS / 2; listA <- c(rep(1, half), rep(0, half))
  rows <- vector("list", 2 * n_grp); k <- 0
  for (cond in c(0, 1)) for (j in seq_len(n_grp)) {
    k <- k + 1
    c_j <- rnorm(1, cond * dc, sd_c)
    d_j <- max(0.05, rnorm(1, BASE_D + cond * dd, sd_dp))
    truth <- if (j %% 2 == 0) listA else 1 - listA
    eta <- (-c_j - d_j / 2) + d_j * truth + item_eff
    rows[[k]] <- data.frame(
      participant_id = sprintf("S%d_%03d", cond, j),
      condition = ifelse(cond == 1, "decentering", "active_control"),
      item_id = sprintf("i%03d", seq_len(N_TRIALS)),
      source_truth = truth,
      response_external = as.integer(runif(N_TRIALS) < pnorm(eta)))
  }
  d <- do.call(rbind, rows)
  if (attrition > 0) {
    ids <- unique(d$participant_id)
    keep <- sample(ids, round((1 - attrition) * length(ids)))
    d <- d[d$participant_id %in% keep, ]
  }
  d$condition <- factor(d$condition, levels = c("active_control", "decentering"))
  d$participant_id <- factor(d$participant_id); d$item_id <- factor(d$item_id)
  d
}

fit_hier <- function(d) {
  for (lvl in names(FORM)) {
    m <- tryCatch(suppressMessages(suppressWarnings(
      glmer(FORM[[lvl]], data = d, family = binomial(link = "probit"), nAGQ = 1L,
            control = glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 1e5),
                                   calc.derivs = FALSE)))),
      error = function(e) NULL)
    if (is.null(m)) next
    sing <- tryCatch(isSingular(m, tol = 1e-4), error = function(e) TRUE)
    if (!sing || lvl == "int") return(list(m = m, level = lvl, singular = sing))
  }
  NULL
}

run_unit <- function(uid) {
  u <- units[units$unit_id == uid, ]; g <- grid[u$cell, ]
  out_path <- file.path(OUT, "units", sprintf("unit_%02d.csv", uid))
  if (file.exists(out_path)) return(invisible(NULL))   # resume-safe
  assign(".Random.seed", streams[[uid]], envir = .GlobalEnv)
  res <- vector("list", SIMS)
  for (s in seq_len(SIMS)) {
    d <- gen_data(g$n_grp, g$sd_c, g$sd_dp, g$sd_item, g$attr, u$dc, u$dd)
    f <- fit_hier(d)
    if (is.null(f)) {
      res[[s]] <- data.frame(unit_id = uid, sim = s, fitted = 0, level = "NONE",
                             singular = NA, dc_hat = NA, se = NA, sig = 0,
                             dd_hat = NA, covered = NA)
      next
    }
    fe <- fixef(f$m); V <- as.matrix(vcov(f$m))
    L <- rep(0, length(fe)); names(L) <- names(fe)
    L["conditiondecentering"] <- -1; L["conditiondecentering:source_truth"] <- -0.5
    dc_hat <- sum(L * fe); se <- sqrt(as.numeric(t(L) %*% V %*% L))
    res[[s]] <- data.frame(unit_id = uid, sim = s, fitted = 1, level = f$level,
                           singular = f$singular, dc_hat = dc_hat, se = se,
                           sig = as.integer(dc_hat / se > ZCRIT),
                           dd_hat = unname(fe[["conditiondecentering:source_truth"]]),
                           covered = as.integer(abs(dc_hat - u$dc) <= 1.96 * se))
  }
  write.csv(do.call(rbind, res), out_path, row.names = FALSE)
  invisible(NULL)
}

if (MODE == "run") {
  ids <- if (length(args) > 3) as.integer(args[4:length(args)]) else units$unit_id
  # order: biggest n first so the slowest units start early (better 2-core packing)
  ids <- ids[order(-grid$n_grp[units$cell[match(ids, units$unit_id)]])]
  mclapply(ids, run_unit, mc.cores = 2, mc.preschedule = FALSE)
  cat("run complete for", length(ids), "units\n")
} else if (MODE == "aggregate") {
  files <- list.files(file.path(OUT, "units"), full.names = TRUE, pattern = "^unit_")
  sims <- do.call(rbind, lapply(files, read.csv))
  cells <- data.frame(); fails <- data.frame()
  for (uid in sort(unique(sims$unit_id))) {
    u <- units[units$unit_id == uid, ]; g <- grid[u$cell, ]
    x <- sims[sims$unit_id == uid, ]
    att <- nrow(x); comp <- sum(x$fitted)
    hits <- sum(x$sig)
    p_att <- hits / att
    ci <- binom.test(hits, att)$conf.int
    ok <- x$fitted == 1
    cells <- rbind(cells, data.frame(
      unit_id = uid, condition = u$cond_label, cell = u$cell,
      n_per_group = g$n_grp, sd_c = g$sd_c, sd_dprime = g$sd_dp,
      sd_item = g$sd_item, attrition = g$attr,
      generating_dc = u$dc, generating_dd = u$dd,
      sims_attempted = att, sims_required_by_lock = LOCK_REQUIRED_SIMS,
      lock_complete = att >= LOCK_REQUIRED_SIMS,
      fits_completed = comp,
      rate_full = mean(x$level == "full"), rate_uncorrelated = mean(x$level == "unc"),
      rate_intercept_only = mean(x$level == "int"), rate_nonconverged = mean(x$level == "NONE"),
      rate_singular = mean(x$singular[ok], na.rm = TRUE),
      power_attempted_denom = p_att, mc_se = sqrt(p_att * (1 - p_att) / att),
      ci95_low = ci[1], ci95_high = ci[2],
      mean_dc_hat = mean(x$dc_hat[ok]), bias_dc = mean(x$dc_hat[ok]) - u$dc,
      rmse_dc = sqrt(mean((x$dc_hat[ok] - u$dc)^2)),
      mean_se = mean(x$se[ok]), coverage95 = mean(x$covered[ok]),
      mean_dd_hat = mean(x$dd_hat[ok])))
    bad <- x[x$fitted == 0 | x$level != "full", ]
    if (nrow(bad)) fails <- rbind(fails, cbind(condition = u$cond_label, cell = u$cell, bad))
  }
  dir.create(OUT, showWarnings = FALSE)
  write.csv(cells, file.path(OUT, "power_full_cells.csv"), row.names = FALSE)
  write.csv(fails, file.path(OUT, "power_full_failures.csv"), row.names = FALSE)
  # disclosure of never-run cells (B/C outside sub-grid)
  not_run <- expand.grid(condition = c("B_null", "C_sensonly"),
                         cell = setdiff(seq_len(nrow(grid)), subgrid_idx))
  summ <- list(
    status = "CANDIDATE · SYNTHETIC ONLY · PARTIAL RUN — every cell below lock requirement",
    master_seed = MASTER_SEED, sims_per_cell_run = SIMS,
    sims_required_by_lock = LOCK_REQUIRED_SIMS,
    units_run = length(unique(sims$unit_id)), units_defined = nrow(units),
    cells_never_run = nrow(not_run),
    never_run_detail = "B_null and C_sensonly outside the prespecified 12-cell sub-grid (36 cells each)",
    alpha_one_sided = 0.05, sesoi_delta_c = SESOI, dd_sensonly = DD_SENS,
    estimation = "lme4::glmer, probit, Laplace nAGQ=1, bobyqa, calc.derivs=FALSE",
    rng = "L'Ecuyer-CMRG, one recorded stream per unit, resume-safe per-unit outputs")
  write_json(summ, file.path(OUT, "power_full_summary.json"), auto_unbox = TRUE, pretty = TRUE)
  cat("aggregated", length(files), "units ->", file.path(OUT, "power_full_cells.csv"), "\n")
}
