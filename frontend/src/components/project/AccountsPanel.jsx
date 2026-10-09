import { useEffect, useState } from "react";
import { KeyRound, LogIn, Plus, Trash2 } from "lucide-react";
import {
  checkAccountLogin,
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from "../../services/api";
import { formatDate } from "../../lib/qa";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import ConfirmDialog from "../ConfirmDialog";
import { EmptyState, ErrorMessage, LoadingMessage } from "../StatusMessages";

const KEY_COMMAND =
  'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"';

function AccountForm({ account, onSave, onCancel }) {
  const editing = !!account;
  const [name, setName] = useState(account?.name ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState(account?.login_url ?? "");
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name,
      username,
      login_url: loginUrl,
      is_default: isDefault,
    };
    if (password) payload.password = password;
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acct-name">Name</Label>
          <Input
            id="acct-name"
            placeholder="e.g. Standard user"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-user">Username or email</Label>
          <Input
            id="acct-user"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-pass">Password</Label>
          <Input
            id="acct-pass"
            type="password"
            autoComplete="new-password"
            placeholder={editing ? "Leave empty to keep the current one" : ""}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-url">Login page (optional)</Label>
          <Input
            id="acct-url"
            type="url"
            placeholder="The app URL when empty"
            value={loginUrl}
            onChange={(e) => setLoginUrl(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Default account: the app map and test runs use it unless a case picks
        another
      </label>
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            saving ||
            !name.trim() ||
            !username.trim() ||
            (!editing && !password)
          }
        >
          {saving && <Spinner className="size-3.5" />}
          {editing ? "Save" : "Add account"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LoginStatus({ account }) {
  if (account.last_login_error) {
    return (
      <p className="text-xs text-fail">
        Login failed: {account.last_login_error}
      </p>
    );
  }
  if (account.last_login_at) {
    return (
      <p className="text-xs text-pass">
        Logged in {formatDate(account.last_login_at)}
      </p>
    );
  }
  return <p className="text-xs text-muted-foreground">Not tried yet</p>;
}

export default function AccountsPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // null | "new" | account id being edited
  const [checking, setChecking] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirming, setConfirming] = useState(false);

  function load() {
    return listAccounts(projectId)
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function replace(account) {
    setData((d) => ({
      ...d,
      accounts: d.accounts.map((a) => (a.id === account.id ? account : a)),
    }));
  }

  async function handleCheck(account) {
    setChecking(account.id);
    setError(null);
    try {
      replace((await checkAccountLogin(projectId, account.id)).account);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(null);
    }
  }

  async function handleDelete() {
    setConfirming(true);
    try {
      await deleteAccount(projectId, deleting.id);
      setDeleting(null);
      await load(); // the default may have moved
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  if (!data)
    return error ? <ErrorMessage message={error} /> : <LoadingMessage />;

  const addButton = mode === null && data.credentials_ready && (
    <Button onClick={() => setMode("new")}>
      <Plus />
      Add account
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose space-y-1">
          <h3 className="text-sm font-semibold">Accounts</h3>
          <p className="text-sm text-muted-foreground">
            Logins to the app, so the app map and tests can get past the login
            page. Add one per role you test with, e.g. an admin and a standard
            user. Passwords are encrypted, never shown again, and never sent to
            the AI: the login form is filled in by plain code.
          </p>
        </div>
        {data.accounts.length > 0 && addButton}
      </div>

      {!data.credentials_ready && (
        <div className="space-y-2 rounded-lg border border-review/40 bg-review-wash p-4 text-sm">
          <p className="font-medium">
            Set an encryption key before adding accounts
          </p>
          <p className="text-muted-foreground">
            Generate a key, add it to the backend&apos;s{" "}
            <span className="font-mono">.env</span> as{" "}
            <span className="font-mono">CREDENTIALS_KEY=…</span>, and restart
            the backend. Keep it safe: changing it makes stored passwords
            unreadable.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-xs">
            {KEY_COMMAND}
          </pre>
        </div>
      )}

      {mode === "new" && (
        <AccountForm
          onCancel={() => setMode(null)}
          onSave={async (payload) => {
            await createAccount(projectId, payload);
            setMode(null);
            await load();
          }}
        />
      )}

      <ErrorMessage message={error} />

      {data.accounts.length === 0 ? (
        mode === null && (
          <EmptyState action={addButton}>
            No accounts. Add one if the app needs a login; public sites
            don&apos;t.
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.accounts.map((account) =>
            mode === account.id ? (
              <li key={account.id} className="p-3">
                <AccountForm
                  account={account}
                  onCancel={() => setMode(null)}
                  onSave={async (patch) => {
                    await updateAccount(projectId, account.id, patch);
                    setMode(null);
                    await load();
                  }}
                />
              </li>
            ) : (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{account.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {account.username}
                    </span>
                    {account.is_default && (
                      <span className="rounded border border-border px-1.5 text-xs text-muted-foreground">
                        Default
                      </span>
                    )}
                  </div>
                  <LoginStatus account={account} />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checking !== null || !data.credentials_ready}
                    onClick={() => handleCheck(account)}
                  >
                    {checking === account.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <LogIn />
                    )}
                    Test login
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!data.credentials_ready}
                    onClick={() => setMode(account.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${account.name}`}
                    onClick={() => setDeleting(account)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this account?"
        message={
          deleting && `"${deleting.name}" and its saved login will be removed.`
        }
        confirmLabel="Delete"
        danger
        confirming={confirming}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
