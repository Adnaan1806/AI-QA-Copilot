import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleAlert, House, Inbox, ListChecks, LogOut, Plus, Search } from "lucide-react";
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
import ProjectTile from "./ProjectTile";
import SearchDialog from "./SearchDialog";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useDataVersion } from "../context/DataVersionContext";
import { initials } from "../lib/project";
import { listProjects, listRequirements, listTestSuites } from "../services/api";

function useWorkspaceSummary() {
  const { version } = useDataVersion();
  const [projects, setProjects] = useState([]);
  const [requirements, setRequirements] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projectList, requirementList] = await Promise.all([listProjects(), listRequirements()]);
        const suites = await Promise.all(projectList.map((p) => listTestSuites(p.id)));
        if (cancelled) return;
        setProjects(projectList.map((p, i) => ({ ...p, suites: suites[i] })));
        setRequirements(requirementList);
      } catch {
        // The sidebar is a summary; pages surface their own load errors.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const waiting = requirements.filter((r) => r.case_counts.draft > 0);
  const queue = {
    cases: waiting.reduce((sum, r) => sum + r.case_counts.draft, 0),
    requirements: waiting.length,
    failing: requirements.reduce((sum, r) => sum + r.case_counts.needs_review, 0),
  };
  return { projects, requirements, queue };
}

const COUNT = "tabular rounded-full px-1.5 font-mono text-[11px]";

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { projects, requirements, queue } = useWorkspaceSummary();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const onRequirements = pathname === "/requirements";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <Link to="/" className="flex items-center gap-2.5 px-1.5 py-1.5">
          <BrandMark on="sidebar" />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            Testwright <span className="font-medium text-primary">AI</span>
          </span>
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setSearching(true)}
              tooltip="Search (Ctrl K)"
              className="border border-sidebar-border bg-background text-muted-foreground hover:text-foreground"
            >
              <Search />
              <span>Search</span>
              <kbd className="ml-auto rounded border border-b-2 border-border px-1 font-mono text-[10px] group-data-[collapsible=icon]:hidden">
                Ctrl K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Home">
                  <Link to="/">
                    <House />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onRequirements && search.includes("stage=review")}
                  tooltip="Review queue"
                >
                  <Link to="/requirements?stage=review">
                    <Inbox />
                    <span>Review queue</span>
                  </Link>
                </SidebarMenuButton>
                {queue.cases > 0 && (
                  <SidebarMenuBadge
                    className={`${COUNT} bg-primary text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground`}
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
                  <SidebarMenuBadge className={`${COUNT} bg-review-wash text-review`}>{queue.failing}</SidebarMenuBadge>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={onRequirements && !search} tooltip="Requirements">
                  <Link to="/requirements">
                    <ListChecks />
                    <span>Requirements</span>
                  </Link>
                </SidebarMenuButton>
                {requirements.length > 0 && (
                  <SidebarMenuBadge className={`${COUNT} bg-muted text-muted-foreground`}>{requirements.length}</SidebarMenuBadge>
                )}
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
                      <ProjectTile project={project} />
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
        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-1 pt-3 pb-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:border-t-0 group-data-[collapsible=icon]:pt-1">
          {user && (
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              title={user.name}
              aria-hidden
            >
              {initials(user.name)}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{user?.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
            <ThemeToggle />
            <Button variant="ghost" size="icon-sm" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut />
            </Button>
          </div>
        </div>
      </SidebarFooter>

      <SearchDialog open={searching} onOpenChange={setSearching} projects={projects} requirements={requirements} />
    </Sidebar>
  );
}
