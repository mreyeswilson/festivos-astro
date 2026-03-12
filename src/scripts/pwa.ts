import { registerSW } from 'virtual:pwa-register';

window.addEventListener('load', () => {
  const toast = document.querySelector<HTMLElement>('#pwa-toast');
  const message = document.querySelector<HTMLElement>('#pwa-toast-message');
  const refreshButton = document.querySelector<HTMLButtonElement>('#pwa-refresh');
  const closeButton = document.querySelector<HTMLButtonElement>('#pwa-close');

  if (!toast || !message || !refreshButton || !closeButton) {
    return;
  }

  let refreshServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

  const hideToast = () => {
    toast.classList.remove('is-visible', 'is-refresh');
  };

  const showToast = (text: string, needsRefresh: boolean) => {
    message.textContent = text;
    toast.classList.toggle('is-refresh', needsRefresh);
    toast.classList.add('is-visible');
  };

  closeButton.addEventListener('click', hideToast);
  refreshButton.addEventListener('click', () => refreshServiceWorker?.(true));

  refreshServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      showToast('La aplicacion ya puede abrirse sin conexion.', false);
    },
    onNeedRefresh() {
      showToast('Hay una version nueva disponible.', true);
    }
  });
});
