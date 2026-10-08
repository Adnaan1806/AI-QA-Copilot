import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleAlert, FolderOpen, Inbox, ListChecks, LogOut, Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./ui/sidebar";
import { Button } from "./ui/button";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useDataVersion } from "../context/DataVersionContext";
import { listProjects, listRequirements, listTestSuites } from "../services/api";

function useWorkspaceSummary() {
  const { version } = useDataVersion();
  const [projects, setProjects] = useState([]);
  const [queue, setQueue] = useState({ cases: 0, requirements: 0, failing: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projectList, requirements] = await Promise.all([listProjects(), listRequirements()]);
        const suites = await Promise.all(projectList.map((p) => listTestSuites(p.id)));
        if (cancelled) return;
        setProjects(projectList.map((p, i) => ({ ...p, suites: suites[i] })));
        const waiting = requirements.filter((r) => r.case_counts.draft > 0);
        setQueue({
          cases: waiting.reduce((sum, r) => sum + r.case_counts.draft, 0),
          requirements: waiting.length,
          failing: requirements.reduce((sum, r) => sum + r.case_counts.needs_review, 0),
        });
      } catch {
        // The sidebar is a summary; pages surface their own load errors.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { projects, queue };
}

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { projects, queue } = useWorkspaceSummary();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const onRequirements = pathname === "/requirements";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2.5 px-1.5 py-1.5">
          <BrandMark />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            AI QA Copilot
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Waiting for you</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onRequirements && search.includes("stage=review")}
                  tooltip="Cases to review"
                >
                  <Link to="/requirements?stage=review">
                    <Inbox />
                    <span>Cases to review</span>
                  </Link>
                </SidebarMenuButton>
                {queue.cases > 0 && (
                  <SidebarMenuBadge
                    className="tabular"
                    title={`${queue.cases} draft cases across ${queue.requirements} requirements`}
                  >
                    {queue.cases}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              {queue.failing > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={onRequirements && search.includes("stage=failing")}
                    tooltip="Failing scripts"
                  >
                    <Link to="/requirements?stage=failing">
                      <CircleAlert className="text-review" />
                      <span>Failing scripts</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="tabular text-review">{queue.failing}</SidebarMenuBadge>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onRequirements && !search}
                  tooltip="All requirements"
                >
                  <Link to="/requirements">
                    <ListChecks />
                    <span>All requirements</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction asChild title="New project">
            <Link to="/?new=1" aria-label="New project">
              <Plus />
            </Link>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/projects/${project.id}`}
                    tooltip={project.name}
                  >
                    <Link to={`/projects/${project.id}`}>
                      <FolderOpen />
                      <span>{project.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {project.suites.length > 0 && (
                    <SidebarMenuSub>
                      {project.suites.map((suite) => (
                        <SidebarMenuSubItem key={suite.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.startsWith(`/suites/${suite.id}`)}
                          >
                            <Link to={`/suites/${suite.id}`}>
                              <span>{suite.name}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col">
          <span className="min-w-0 truncate text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
            {user?.name}
          </span>
          <div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
            <ThemeToggle />
            <Button variant="ghost" size="icon-sm" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
