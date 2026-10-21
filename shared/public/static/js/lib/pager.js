// Pagination helpers.

export function lastPage(total, perPage) {
  return Math.max(1, Math.ceil(total / perPage));
}

// 1, current-1..current+1 and last; '…' stands in for each gap.
export function pageItems(current, last) {
  const pages = [...new Set([1, current - 1, current, current + 1, last])]
    .filter((p) => p >= 1 && p <= last)
    .sort((a, b) => a - b);
  const items = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) items.push('…');
    items.push(p);
  });
  return items;
}

export function rangeText(page, perPage, total) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return `แสดง ${from}–${to} จาก ${total} รายการ (หน้าละ ${perPage})`;
}

export function mobilePageText(page, last) {
  return `หน้า ${page} จาก ${last}`;
}
