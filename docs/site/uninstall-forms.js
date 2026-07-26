/* uninstall-forms.js — Google Form wiring for the uninstall feedback pages.
   The only file to touch when the Forms are (re)created; uninstall.js reads it
   and stays inert while the ids are still placeholders.

   Getting the ids: open the Form → ⋮ menu → "Get pre-filled link" → fill dummy
   values → Copy link. The resulting URL carries the form id
   (/forms/d/e/<FORM_ID>/viewform) and one entry.<N> per question.

   Each Form needs these 9 questions — NONE of them required, and
   "Collect email addresses" OFF (a required question or a missing option makes
   Google reject the whole response silently):

     reasons    checkboxes — options must be EXACTLY these five values:
                  not-what-expected
                  dont-understand-how
                  wanted-in-page-ui
                  found-bugs
                  other
                plus, on the GEMINI FOLDERS Form only, a sixth:
                  switched-to-ai-folders
                (English keys, never the translated labels: the labels differ per
                 visitor and Google drops unknown options, which would also make
                 the response sheet unreadable across 43 languages)

                The GF page offers switched-to-ai-folders as its first checkbox.
                If that option is missing from the GF Form, Google rejects the
                WHOLE response — not just that field — so add it before shipping.
                The AF page never sends it, so the AF Form must not have it.
     other      short answer      comments   paragraph
     days       short answer      daysExact  short answer — "yes" / "no"
     opens      short answer      version    short answer
     browser    short answer      lang       short answer

   daysExact is "no" when the install date was inferred at update time (users who
   were already installed when the survey shipped), so those rows stay
   distinguishable from real tenures instead of polluting the numbers.

   The two products share the same entry.<N> ids on purpose: the second Form was
   made with "Make a copy", which preserves them. Only formId differs, so a
   response still lands in the right response sheet. Verified against both live
   Forms — if you ever rebuild one from scratch, its ids WILL differ and this
   block must be refilled from that Form's own pre-filled link. */
window.UF_FORMS = {
  af: {
    formId: '1FAIpQLSfI6UdBpgYJSekal8re65pgHR_HyPQb3mrMFYM2piaAz1X7oA',
    fields: {
      reasons: 'entry.960754458', other: 'entry.834717989', comments: 'entry.279751166',
      days: 'entry.2071424621', daysExact: 'entry.868004239', opens: 'entry.1542013798',
      version: 'entry.712983012', browser: 'entry.1147186631', lang: 'entry.358917109',
    },
  },
  gf: {
    formId: '1FAIpQLSc2ovbNCKvWKN1881QiE67eKor0MOeb7sLxMFsM2bh9ZgTDjQ',
    fields: {
      reasons: 'entry.960754458', other: 'entry.834717989', comments: 'entry.279751166',
      days: 'entry.2071424621', daysExact: 'entry.868004239', opens: 'entry.1542013798',
      version: 'entry.712983012', browser: 'entry.1147186631', lang: 'entry.358917109',
    },
  },
};
