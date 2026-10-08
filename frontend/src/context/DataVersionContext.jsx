import { createContext, useCallback, useContext, useState } from "react";

const DataVersionContext = createContext({ version: 0, bump: () => {} });

// A shared counter that pages bump after changing review state, so views that
// summarize it elsewhere (the sidebar's review queue) know to refetch.
export function DataVersionProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <DataVersionContext.Provider value={{ version, bump }}>{children}</DataVersionContext.Provider>
  );
}

export function useDataVersion() {
  return useContext(DataVersionContext);
}
