import { useEffect, useState } from 'react';

type ApiState = 'checking' | 'available' | 'unavailable';

export function App() {
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        setApiState('available');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setApiState('unavailable');
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <div className="brand">Filtrovali</div>
      <section className="card">
        <p className="eyebrow">Comercial</p>
        <h1>Aplicativo Comercial</h1>
        <p>
          A estrutura independente está pronta para receber as telas, os dados
          e os serviços do módulo Comercial atual.
        </p>
        <p className="status" role="status">
          API: {apiState === 'checking' ? 'verificando' : apiState === 'available' ? 'disponível' : 'indisponível'}
        </p>
      </section>
    </main>
  );
}
