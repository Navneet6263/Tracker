import { useState, useEffect } from "react";

export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fn()
      .then((r) => setData(r.data))
      .catch(setError)
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, error };
}
