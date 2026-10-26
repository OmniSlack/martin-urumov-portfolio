#!/usr/bin/env Rscript
# PILOT_A — simulation-based power under the locked model (EXECUTION LOCK §11)
# CANDIDATE · SYNTHETIC ONLY · not evidence about the hypothesis.
#
# Simulates the locked design (between-participant, 100 test trials, 50/50
# source, A/B counterbalancing, participant intercept + source_truth slope,
# item intercept), fits the locked convergence hierarchy, and tests the primary
# one-sided estimand delta_c = -(b_cond + 0.5*b_int) > 0 at alpha = 0.05.
#
# Usage:
#   Rscript analysis_R/power_simulation.R <config/power_simulation.json> <out_prefix> [demo|full]
# demo mode: n_simulations_demo sims, nAGQ=0 fast fits, reduced grid — PIPELINE
# DEMONSTRATION ONLY. The final pre-preregistration run MUST use "full".

suppressMessages({ library(lme4); library(jsonlite) })

args <- commandArgs(trailingOnly = TRUE)
cfg_path <- if (length(args) >= 1) args[[1]] else "config/power_simulation.json"
out_pref <- if (length(args) >= 2) args[[2]] else "outputs/r_validation/power"
mode     <- if (length(args) >= 3) args[[3]] else "demo"
cfg <- fromJSON(cfg_path)

set.seed(20260720)

N_TRIALS <- cfg$test_trials_per_participant
SESOI    <- cfg$sesoi_delta_c
ALPHA    <- cfg$alpha_one_sided
ZCRIT    <- qnorm(1 - ALPHA)
NSIM     <- if (mode == "full") cfg$n_simulations_full else cfg$n_simulations_demo
NAGQ     <- if (mode == "full") 1L else 0L

# Grid: full mode uses the whole locked grid; demo uses a labeled subset.
if (mode == "full") {
  grid <- expand.grid(sd_c   = cfg$variance_grid$sd_c_participant,
                      sd_dp  = cfg$variance_grid$sd_dprime_participant,
                      sd_it  = cfg$variance_grid$sd_item_intercept,
                      n_grp  = cfg$n_per_group_grid,
                      attr   = cfg$attrition_sensitivity_rates)
} else {
  grid <- expand.grid(sd_c = c(0.25, 0.35), sd_dp = 0.25, sd_it = 0.10,
                      n_grp = 60, attr = 0.0)
}

simulate_dataset <- function(n_grp, sd_c, sd_dp, sd_it, attrition,
                             base_d = cfg$base_parameters$base_dprime,
                             base_c = cfg$base_parameters$base_c, delta_c = SESOI) {
  n_items <- N_TRIALS
  item_eff <- rnorm(n_items, 0, sd_it)              # item random intercepts
  half <- n_items / 2
  listA <- c(rep(1, half), rep(0, half))            # 1 = external in list A
  rows <- vector("list", 2 * n_grp)
  k <- 0
  for (cond in c(0, 1)) {                           # 0 control, 1 decentering
    for (j in seq_len(n_grp)) {
      k <- k + 1
      c_j <- rnorm(1, base_c + cond * delta_c, sd_c)
      d_j <- max(0.05, rnorm(1, base_d, sd_dp))
      lst <- if (j %% 2 == 0) "A" else "B"
      truth <- if (lst == "A") listA else 1 - listA
      eta <- (-c_j - d_j / 2) + d_j * truth + item_eff
      resp <- as.integer(runif(n_items) < pnorm(eta))
      rows[[k]] <- data.frame(
        participant_id = sprintf("SIM-%d-%03d", cond, j),
        condition = ifelse(cond == 1, "decentering", "active_control"),
        item_id = sprintf("item_%03d", seq_len(n_items)),
        source_truth = truth, response_external = resp)
    }
  }
  d <- do.call(rbind, rows)
  if (attrition > 0) {
    keep <- sample(unique(d$participant_id),
                   size = round((1 - attrition) * length(unique(d$participant_id))))
    d <- d[d$participant_id %in% keep, ]
  }
  d$condition <- factor(d$condition, levels = c("active_control", "decentering"))
  d$participant_id <- factor(d$participant_id); d$item_id <- factor(d$item_id)
  d
}

FORMULAS <- list(
  full         = response_external ~ condition * source_truth + (1 + source_truth | participant_id) + (1 | item_id),
  uncorrelated = response_external ~ condition * source_truth + (1 + source_truth || participant_id) + (1 | item_id),
  intercepts   = response_external ~ condition * source_truth + (1 | participant_id) + (1 | item_id)
)

fit_hierarchy <- function(d) {
  for (lvl in names(FORMULAS)) {
    m <- tryCatch(suppressMessages(suppressWarnings(
      glmer(FORMULAS[[lvl]], data = d, family = binomial(link = "probit"), nAGQ = NAGQ,
            control = glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 1e5),
                                   calc.derivs = FALSE))
    )), error = function(e) NULL)
    if (is.null(m)) next
    sing <- tryCatch(isSingular(m, tol = 1e-4), error = function(e) TRUE)
    if (!sing) return(list(m = m, level = lvl, singular = FALSE))
    if (lvl == "intercepts") return(list(m = m, level = lvl, singular = sing))
  }
  NULL
}

test_primary <- function(m) {
  fe <- fixef(m); V <- as.matrix(vcov(m))
  L <- rep(0, length(fe)); names(L) <- names(fe)
  L["conditiondecentering"] <- -1
  L["conditiondecentering:source_truth"] <- -0.5
  dc <- sum(L * fe); se <- sqrt(as.numeric(t(L) %*% V %*% L))
  z <- dc / se
  list(dc = dc, se = se, z = z, sig = (z > ZCRIT))
}

results <- data.frame()
for (g in seq_len(nrow(grid))) {
  p <- grid[g, ]
  hits <- 0; fitted_n <- 0; dc_est <- c(); levels_used <- c()
  for (s in seq_len(NSIM)) {
    d <- simulate_dataset(p$n_grp, p$sd_c, p$sd_dp, p$sd_it, p$attr)
    f <- fit_hierarchy(d)
    if (is.null(f)) next
    fitted_n <- fitted_n + 1
    t <- test_primary(f$m)
    hits <- hits + as.integer(t$sig)
    dc_est <- c(dc_est, t$dc); levels_used <- c(levels_used, f$level)
  }
  results <- rbind(results, data.frame(
    mode = mode, n_per_group = p$n_grp, sd_c = p$sd_c, sd_dprime = p$sd_dp,
    sd_item = p$sd_it, attrition = p$attr, sesoi_delta_c = SESOI,
    n_sims = NSIM, n_fitted = fitted_n,
    power_est = ifelse(fitted_n > 0, hits / fitted_n, NA),
    mean_dc_hat = ifelse(length(dc_est) > 0, mean(dc_est), NA),
    pct_full_model = mean(levels_used == "full"),
    pct_fallback = mean(levels_used != "full")))
  cat(sprintf("[power %s] n/grp=%d sd_c=%.2f sd_item=%.2f attr=%.2f -> power=%.2f (fitted %d/%d, mean dc=%.3f, full-model %.0f%%)\n",
              mode, p$n_grp, p$sd_c, p$sd_it, p$attr,
              results$power_est[nrow(results)], fitted_n, NSIM,
              results$mean_dc_hat[nrow(results)], 100 * results$pct_full_model[nrow(results)]))
}

write.csv(results, paste0(out_pref, "_grid.csv"), row.names = FALSE)
meta <- list(
  status = "CANDIDATE · SYNTHETIC ONLY",
  mode = mode,
  warning = if (mode == "demo")
    "DEMO-SCALE run (few sims, nAGQ=0, reduced grid) — pipeline demonstration ONLY; NOT a power result. Final run must use mode=full."
  else "Full-mode run; verify variance grid against literature before preregistration.",
  sesoi_delta_c = SESOI, alpha_one_sided = ALPHA, power_target = cfg$power_target,
  n_simulations = NSIM, nAGQ = NAGQ)
write_json(meta, paste0(out_pref, "_meta.json"), auto_unbox = TRUE, pretty = TRUE)
cat("[power] written:", paste0(out_pref, "_grid.csv"), "and _meta.json\n")
