export const HAS_FS = typeof window.showDirectoryPicker==='function';
export const IS_BRAVE = !!(navigator.brave && typeof navigator.brave.isBrave==='function');
// Explains why folder connection / Tidy is unavailable and what to do (shown only when it is missing)
export function fsNotice(){
  if(HAS_FS) return '';
  if(IS_BRAVE) return `<div class="alert warn" style="margin-top:10px"><b>Brave turns off direct folder access by default.</b> To connect a folder and use Tidy: open <code>brave://flags/#file-system-access-api</code> in a new tab, set it to <b>Enabled</b>, press <b>Relaunch</b>, then come back here. Until then you can still use <i>Select reports folder</i> or drag and drop; everything works except Tidy and automatic refresh.</div>`;
  return `<div class="alert warn" style="margin-top:10px">This browser cannot keep a folder connection, so <b>Tidy</b> and automatic refresh are unavailable. Use Chrome or Edge on a computer (or Brave with <code>brave://flags/#file-system-access-api</code> enabled). Select/drag-and-drop still works.</div>`;
}
