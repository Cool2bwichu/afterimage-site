// A failure with a code the job store can explain safely (see SAFE_FAILURES).
export function engineError(code, message) {
  return Object.assign(new Error(message), { code });
}

export const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
