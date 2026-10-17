import { auth } from '../lib/firebase';

let installed = false;

/** Añade el token vigente solo a peticiones same-origin de la API comercial. */
export function installFirebaseApiAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const requestUrl = new URL(request.url);
    const isProtectedApi = requestUrl.origin === window.location.origin
      && requestUrl.pathname.startsWith('/api/')
      && requestUrl.pathname !== '/api/health';

    if (!isProtectedApi || !auth?.currentUser) return nativeFetch(request);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${idToken}`);
      // This is an untrusted tenant selector. Express verifies an active
      // membership and subscription before using it for any data operation.
      const companyId = localStorage.getItem('nexoss_active_company_id');
      if (companyId) headers.set('X-Company-Id', companyId);
      return nativeFetch(new Request(request, { headers }));
    } catch {
      // Sin token, el servidor rechazará la petición con 401.
      return nativeFetch(request);
    }
  }) as typeof window.fetch;
}
