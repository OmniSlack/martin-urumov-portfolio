#!/usr/bin/env Rscript
# PILOT_A — validated confirmatory GLMM implementation (R + lme4, probit link)
# CANDIDATE · per PILOT_A_EXECUTION_LOCK_v0.1 §10
#
# SYNTHETIC VALIDATION ONLY in this repository: running this script on the
# generated scenario CSVs validates the pipeline mechanics. Outputs on synthetic
# data are NOT evidence about the hypothesis. Real-data use requires ethics
# approval, preregistration, and Martin's explicit authorization.
#
# Usage: Rscript analysis_R/fit_glmm.R <trials.csv> <output.json>

suppressMessages({ library(lme4); library(jsonlite) })

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("usage: fit_glmm.R <trials.csv> <output.json>")
infile <- args[[1]]; outfile <- args[[2]]

d <- read.csv(infile, stringsAsFactors = FALSE)
d <- d[d$practice_trial == 0, ]                       # test trials only
d$condition    <- factor(d$condition, levels = c("active_control", "decentering"))
d$source_truth <- as.numeric(d$source_truth)          # 0 = internal, 1 = external
d$participant_id <- factor(d$participant_id)
d$item_id        <- factor(d$item_id)

# Locked convergence hierarchy (EXECUTION LOCK §10). No post hoc model search.
FORMULAS <- list(
  full          = response_external ~ condition * source_truth +
                    (1 + source_truth | participant_id) + (1 | item_id),
  uncorrelated  = response_external ~ condition * source_truth +
                    (1 + source_truth || participant_id) + (1 | item_id),
  intercepts    = response_external ~ condition * source_truth +
                    (1 | participant_id) + (1 | item_id)
)

fit_one <- function(fm, data) {
  glmer(fm, data = data, family = binomial(link = "probit"),
        control = glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 2e5)))
}

is_clean <- function(m) {
  msgs <- unlist(m@optinfo$conv$lme4$messages)
  conv_ok <- length(msgs) == 0
  !isSingular(m, tol = 1e-4) && conv_ok
}

used_level <- NA; model <- NULL; singular <- NA; conv_msgs <- character(0)
for (lvl in names(FORMULAS)) {
  m <- tryCatch(fit_one(FORMULAS[[lvl]], d), error = function(e) e)
  if (inherits(m, "error")) { conv_msgs <- c(conv_msgs, paste(lvl, "ERROR:", conditionMessage(m))); next }
  singular_lvl <- isSingular(m, tol = 1e-4)
  msgs <- unlist(m@optinfo$conv$lme4$messages)
  if (is_clean(m)) { model <- m; used_level <- lvl; singular <- singular_lvl; break }
  conv_msgs <- c(conv_msgs, paste0(lvl, ": singular=", singular_lvl,
                                   if (length(msgs)) paste0("; ", paste(msgs, collapse = " | ")) else ""))
  if (lvl == "intercepts") { model <- m; used_level <- lvl; singular <- singular_lvl }  # last resort, reported
}
if (is.null(model)) stop("no model could be fitted at any hierarchy level")

fe  <- fixef(model)
V   <- as.matrix(vcov(model))
b_cond <- fe[["conditiondecentering"]]
b_int  <- fe[["conditiondecentering:source_truth"]]

# Estimand mapping (locked): delta_c = -(b_cond + 0.5*b_int); delta_dprime = b_int
L <- rep(0, length(fe)); names(L) <- names(fe)
L["conditiondecentering"] <- -1
L["conditiondecentering:source_truth"] <- -0.5
dc_hat <- sum(L * fe)
dc_se  <- sqrt(as.numeric(t(L) %*% V %*% L))
dc_z   <- dc_hat / dc_se
dc_p_one_sided <- pnorm(dc_z, lower.tail = FALSE)     # H1: delta_c > 0

dd_hat <- b_int
dd_se  <- sqrt(V["conditiondecentering:source_truth", "conditiondecentering:source_truth"])

out <- list(
  status = "SYNTHETIC_VALIDATION_ONLY — not evidence; CANDIDATE",
  input_file = infile,
  n_participants = length(unique(d$participant_id)),
  n_items = length(unique(d$item_id)),
  n_trials = nrow(d),
  model_level_used = used_level,
  singular = singular,
  convergence_notes = conv_msgs,
  formula = deparse1(FORMULAS[[used_level]]),
  link = "probit",
  estimates = list(
    delta_c_hat = unname(dc_hat), delta_c_se = dc_se,
    delta_c_z = dc_z, delta_c_p_one_sided = dc_p_one_sided,
    delta_dprime_hat = unname(dd_hat), delta_dprime_se = dd_se,
    b_condition = unname(b_cond), b_interaction = unname(b_int),
    control_dprime_b_source_truth = unname(fe[["source_truth"]])
  )
)
write_json(out, outfile, auto_unbox = TRUE, digits = 6, pretty = TRUE)
cat(sprintf("[fit_glmm] %s -> level=%s singular=%s  dc=%.4f (se %.4f, p1=%.4g)  dd=%.4f\n",
            basename(infile), used_level, singular, dc_hat, dc_se, dc_p_one_sided, dd_hat))
