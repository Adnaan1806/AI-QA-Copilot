import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { useBreadcrumbItems } from "../context/BreadcrumbContext";

export default function AppBreadcrumbs() {
  const items = useBreadcrumbItems();

  if (items.length === 0) return null;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          // On narrow screens keep only the parent and the current page.
          const narrowHidden = i < items.length - 2 ? "hidden md:inline-flex" : "";
          return (
            <Fragment key={i}>
              <BreadcrumbItem className={`min-w-0 ${narrowHidden}`}>
                {isLast || !item.to ? (
                  <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.to} className="truncate">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className={narrowHidden} />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
