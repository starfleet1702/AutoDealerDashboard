// Global notification/snackbar utility. Exposes `window.notify` with `success`, `error`, `info`.
const DURATION = 4000;

function createContainer(){
  let c = document.getElementById('app-notify-container');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'app-notify-container';
  c.setAttribute('aria-live','polite');
  c.style.position = 'fixed';
  c.style.right = '20px';
  c.style.bottom = '20px';
  c.style.zIndex = '9999';
  c.style.display = 'flex';
  c.style.flexDirection = 'column';
  c.style.gap = '8px';
  document.body.appendChild(c);
  return c;
}

function showToast(message, type='info', duration=DURATION){
  const container = createContainer();
  const el = document.createElement('div');
  el.className = `notify notify-${type}`;
  el.style.minWidth = '220px';
  el.style.maxWidth = '360px';
  el.style.padding = '12px 14px';
  el.style.borderRadius = '10px';
  el.style.color = '#fff';
  el.style.boxShadow = '0 8px 20px rgba(2,6,23,0.2)';
  el.style.opacity = '0';
  el.style.transform = 'translateY(6px)';
  el.style.transition = 'opacity .18s ease, transform .18s ease';
  el.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  if (type === 'success') el.style.background = 'linear-gradient(90deg,#16a34a,#059669)';
  else if (type === 'error') el.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
  else el.style.background = 'linear-gradient(90deg,#2563eb,#1d4ed8)';

  el.textContent = message;
  container.appendChild(el);

  // enter
  requestAnimationFrame(()=>{
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  const timeout = setTimeout(()=>{ hide(el); }, duration);

  el.addEventListener('click', ()=>{ clearTimeout(timeout); hide(el); });

  function hide(node){
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(()=> node.remove(), 200);
  }
}

window.notify = {
  success: (msg,duration)=> showToast(msg,'success',duration),
  error: (msg,duration)=> showToast(msg,'error',duration),
  info: (msg,duration)=> showToast(msg,'info',duration),
  show: (msg,type,duration)=> showToast(msg,type,duration)
};

export default window.notify;
