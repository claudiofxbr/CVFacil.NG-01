'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-forest-deep text-stone-200 p-4">
      <h2 className="text-2xl font-bold mb-4">Algo deu errado!</h2>
      <p className="text-stone-400 mb-6">Ocorreu um erro inesperado na aplicação.</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}
