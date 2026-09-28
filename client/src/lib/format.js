/** Money is integer paise everywhere; format only for display (BR-14). */
export const formatPaise = (p) => `₹${(p / 100).toFixed(2)}`;

/** Equal share of `total` paise for member `index` of `count`; the host (index 0) absorbs leftover paise (BR-10). */
export const splitShare = (total, count, index) => Math.floor(total / count) + (index === 0 ? total % count : 0);
