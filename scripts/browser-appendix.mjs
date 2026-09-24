/** Marked browser notes that talent-playthrough.mjs must keep when it rewrites the doc. */
export const BROWSER_APPENDIX_START = "<!-- browser-appendix:start -->";
export const BROWSER_APPENDIX_END = "<!-- browser-appendix:end -->";

export function preserveBrowserAppendix(previous) {
  const text = String(previous || "");
  const a = text.indexOf(BROWSER_APPENDIX_START);
  const b = text.indexOf(BROWSER_APPENDIX_END);
  if (a < 0 || b < a) return "";
  return text.slice(a, b + BROWSER_APPENDIX_END.length).trim() + "\n";
}
