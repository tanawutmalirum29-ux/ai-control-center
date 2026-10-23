// UI text for the receiving chat; the site cannot create a task by itself.
export const cadenceNote = 'แชทผู้รับตั้ง Scheduled Task ทุก 1 ชั่วโมงเพื่อตรวจงานที่มอบหมาย (หากรองรับ และไม่ตั้งซ้ำ)';
export function relayLine(slot, number, url, marker='MN') {
  return slot + ': ' + marker + ' #' + number + ' ' + url + ' | ' + cadenceNote;
}
