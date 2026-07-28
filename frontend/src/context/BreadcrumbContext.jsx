import { createContext, useContext, useEffect, useState } from "react";

const BreadcrumbContext = createContext(null);

export function BreadcrumbProvider({ children }) {
  const [items, setItems] = useState([]);
  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>{children}</BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbItems() {
  const ctx = useContext(BreadcrumbContext);
  return ctx.items;
}

// Pages call this once their data has loaded, e.g.
// useSetBreadcrumbs([{ label: "Projects", to: "/" }, { label: project.name }]).
// The last item (no `to`) renders as the current page, not a link.
export function useSetBreadcrumbs(items) {
  const ctx = useContext(BreadcrumbContext);
  const key = JSON.stringify(items);

  useEffect(() => {
    ctx.setItems(items);
    return () => ctx.setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
