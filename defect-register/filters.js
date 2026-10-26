"use strict";

/**
 * EXCEPTIONS — "what is NOT an error" (the fourth question of the filters).
 *
 * Ported (translated) from `verify/cedki.js` of omniecho-core. Only the list
 * that register.js consults is carried. Each exception names the detector it
 * can fire on (`triggers`) and how to tell the exception apart from a real
 * error (`how_to_distinguish`).
 *
 * B-9 in the register: an exception register that nothing consults is a line in
 * a folder. compare() therefore MARKS a finding with the exception that may
 * cover it — it never silences the finding.
 */
const EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: "I-1",
    what: "One name, several different numbers",
    example: "In ZA_HORA.md: 139 checks, 11 checks, 21 checks.",
    triggers: "counting_names_not_things",
    why: "Three DIFFERENT quantities with one name: 139 broad tests, 11 narrow probes, 21 something else. " +
         "The detector sees that the word matches; it does not see whether the quantity is the same. " +
         "That is a limit of the INSTRUMENT, not an error in the text.",
    how_to_distinguish: "If the numbers have different neighbouring words or different sections — different " +
                        "quantities. If they stand in one sentence about one thing — an error.",
    text: "We have 139 checks from the broad suite and 11 checks from the narrow probes.",
  }),
  Object.freeze({
    id: "I-2",
    what: "A withdrawn claim, QUOTED in a document about its withdrawal",
    example: "\"19 gates\" appears in the text that explains why it is false.",
    triggers: "counting_names_not_things",
    why: "A document that withdraws a claim MUST quote it. Quoting is not making. The register already " +
         "carries an exception for this — it stands here so that it is not removed in a clean-up.",
    how_to_distinguish: "Is there a word of withdrawal on the same line or within six lines above it.",
    text: "WITHDRAWN: \"19 gates\" was published; the count is 15 gates.",
  }),
  Object.freeze({
    id: "I-3",
    what: "Code that NAMES a defect in order to describe it",
    example: "The register contains the regex with \\b around Cyrillic as an EXAMPLE.",
    triggers: "detector_that_does_not_detect",
    why: "The detector for defect #22 fires on its own example. The file that describes the disease carries " +
         "its symptom — that is unavoidable and is the opposite of a defect.",
    how_to_distinguish: "Is the expression on an executable path, or in a string/comment that describes it.",
    text: "// Example of defect #22: /\\bobvious\\b/ never matches.",
  }),
]);

module.exports = { EXCEPTIONS };
