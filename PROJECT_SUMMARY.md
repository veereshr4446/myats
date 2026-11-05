# MyATS project summary (context for Claude Code)

Free resume/ATS checker for a student project. Budget is zero: keep it a static site, all processing in the browser, deployed free on Vercel.

## Current state
Single `index.html` (vanilla JS, no build step).
- Parsing: pdf.js and mammoth.js from cdnjs.
- Score (100 pts): file format, length (300-1,500 words), action verbs, contact info, section headings.
- Extra checks: measurable results, buzzword detector, optional job description matcher.
- UI: animated score ring, tabs (Fix first, Improve, Passed), parser view, localStorage history, print-to-PDF report, canvas share card, light/dark theme.
- Fonts: Plus Jakarta Sans (headings), Inter (body).

## Next tasks
1. Keep it working as a static site.
2. Convert to Vite + React + Tailwind with the same features and look.
3. Add before/after comparison of two resumes.
4. Deploy cleanly on Vercel.
