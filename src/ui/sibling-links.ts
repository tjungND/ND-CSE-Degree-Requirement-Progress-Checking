// Where the two pages link to EACH OTHER (DGS 2026-09-16). Standalone, each
// links to its sibling file next to it. Embedded in an <iframe> on cse.nd.edu,
// a relative link would load the sibling INSIDE the frame — the student sees
// the bare app page instead of the WordPress page that hosts it. So the
// embed's iframe src names the host pages, and the links then go to those,
// in the top window:
//
//   <iframe src="…/index.html?course_rules_url=https://cse.nd.edu/…/course-rules/">
//   <iframe src="…/courses.html?self_check_url=https://cse.nd.edu/…/degree-self-check/">
//
// Only http(s) URLs are honoured — a javascript: or data: value in a query
// string is ignored, since the value comes from the page's address.
export type SiblingPage = 'self-check' | 'course-rules';

export interface SiblingLink {
  href: string;
  /** `_top` when the link leaves the iframe for the host page. */
  target?: '_top';
}

export const SIBLING_PARAM: Record<SiblingPage, string> = { 'self-check': 'self_check_url', 'course-rules': 'course_rules_url' };
const RELATIVE: Record<SiblingPage, string> = { 'self-check': './index.html', 'course-rules': './courses.html' };

/** The link for `page`, given this page's query string (`location.search`). */
export function siblingLink(page: SiblingPage, search: string): SiblingLink {
  const raw = new URLSearchParams(search).get(SIBLING_PARAM[page])?.trim() ?? '';
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return { href: raw, target: '_top' };
  return { href: RELATIVE[page] };
}
