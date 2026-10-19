import type { RepoSeed } from "./types";

const readme = `# dotfiles

My shell, editor and tmux setup. Mostly for me, but steal whatever is useful.

    git clone <this repo> ~/dotfiles && ~/dotfiles/install.sh

Works on macOS and Debian-ish Linux. The Neovim config needs 0.10 or newer
and uses no plugins, which is the point: it should work on a fresh machine
with nothing but a package manager and five minutes.

## What's in here

- \`.zshrc\`: history, completion, a prompt that shows the git branch
- \`.config/nvim/init.lua\`: options and a handful of keymaps
- \`.tmux.conf\`: Ctrl-a prefix, mouse on, splits that keep the current directory
- \`.gitconfig\`: rebase on pull and a few aliases
- \`install.sh\`: symlinks the above into \`$HOME\`
`;

const zshrc = `# ~/.zshrc

export EDITOR=nvim
export PAGER=less
export LESS=-R

HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt share_history hist_ignore_dups hist_reduce_blanks

autoload -Uz compinit && compinit
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

bindkey -e

alias ll='ls -lah'
alias g='git'
alias gs='git status -sb'
alias vim='nvim'

# Prompt: directory, git branch, caret that turns red on a non-zero exit.
autoload -Uz vcs_info
precmd() { vcs_info }
zstyle ':vcs_info:git:*' formats ' %b'
setopt prompt_subst
PROMPT='%F{blue}%~%f%F{magenta}\${vcs_info_msg_0_}%f %(?.%F{green}.%F{red})❯%f '
`;

const initLua = `-- init.lua: no plugin manager, on purpose.

vim.g.mapleader = " "

local o = vim.opt
o.number = true
o.relativenumber = true
o.signcolumn = "yes"
o.expandtab = true
o.shiftwidth = 2
o.tabstop = 2
o.ignorecase = true
o.smartcase = true
o.undofile = true
o.termguicolors = true
o.scrolloff = 4
o.splitright = true
o.splitbelow = true

local map = vim.keymap.set
map("n", "<leader>w", "<cmd>write<cr>")
map("n", "<leader>e", "<cmd>Explore<cr>")
map("n", "<esc>", "<cmd>nohlsearch<cr>")
map("n", "]d", vim.diagnostic.goto_next)
map("n", "[d", vim.diagnostic.goto_prev)

-- Strip trailing whitespace on save, except in Markdown where two trailing
-- spaces mean a line break.
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function()
    if vim.bo.filetype == "markdown" then
      return
    end
    local view = vim.fn.winsaveview()
    vim.cmd([[%s/\\s\\+$//e]])
    vim.fn.winrestview(view)
  end,
})
`;

const gitconfig = `[user]
	name = mira
	email = mira@fieldnotes.example
[init]
	defaultBranch = main
[pull]
	rebase = true
[push]
	autoSetupRemote = true
[alias]
	lg = log --graph --oneline --decorate
	amend = commit --amend --no-edit
	wip = !git add -A && git commit -m wip
[diff]
	algorithm = histogram
`;

const installSh = `#!/bin/sh
# Symlink everything into $HOME. Existing files are moved to *.bak first.
set -eu

here=$(cd "$(dirname "$0")" && pwd)

link() {
  src="$here/$1"
  dst="$HOME/$1"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.bak"
    echo "backed up $dst"
  fi
  ln -sfn "$src" "$dst"
  echo "linked $1"
}

link .zshrc
link .gitconfig
link .tmux.conf
link .config/nvim/init.lua
`;

const tmuxConf = `set -g prefix C-a
unbind C-b
bind C-a send-prefix

set -g mouse on
set -g base-index 1
setw -g pane-base-index 1
set -g escape-time 10
set -g history-limit 20000
set -g default-terminal "tmux-256color"

bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
bind r source-file ~/.tmux.conf \\; display "reloaded"

set -g status-style "bg=default,fg=colour245"
set -g status-left "#[fg=colour110]#S "
set -g status-right "%H:%M"
`;

export const dotfiles: RepoSeed = {
  owner: { person: "mira" },
  name: "dotfiles",
  description: "zsh, Neovim, tmux and git config. No plugin managers.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["mira"],
  threshold: 1,
  seeding: 3,
  files: {
    "README.md": readme,
    ".zshrc": zshrc,
    ".config/nvim/init.lua": initLua,
    ".gitconfig": gitconfig,
    "install.sh": installSh,
    ".tmux.conf": tmuxConf,
  },
  root: {
    label: "root",
    message: `Initial commit

Pulled out of the old laptop's home directory, minus the 400 lines of
zsh I no longer understand.`,
    author: "mira",
    daysAgo: 410,
  },
  history: [
    {
      label: "zsh-search",
      message: `zsh: pattern search on Ctrl-R

history-incremental-pattern-search-backward accepts globs, so
"git*push" finds what I meant without a fuzzy finder.`,
      author: "mira",
      daysAgo: 352,
      changes: {
        ".zshrc": [
          [
            "bindkey -e\n",
            "bindkey -e\nbindkey '^R' history-incremental-pattern-search-backward\nbindkey '^S' history-incremental-pattern-search-forward\n",
          ],
        ],
      },
    },
    {
      label: "nvim-lsp",
      message: `nvim: built-in LSP for Go and Rust

Uses vim.lsp.config/enable from 0.11, so still no plugins. Servers are
only started if the binary is on PATH.

Also move the diagnostic keymaps to vim.diagnostic.jump, since
goto_next/goto_prev print a deprecation warning on every use now.`,
      author: "mira",
      daysAgo: 268,
      changes: {
        ".config/nvim/init.lua": [
          [
            'map("n", "]d", vim.diagnostic.goto_next)\nmap("n", "[d", vim.diagnostic.goto_prev)\n',
            `map("n", "]d", function() vim.diagnostic.jump({ count = 1, float = true }) end)
map("n", "[d", function() vim.diagnostic.jump({ count = -1, float = true }) end)

-- Language servers, started only when the binary is installed.
vim.lsp.config("gopls", {
  cmd = { "gopls" },
  filetypes = { "go", "gomod" },
  root_markers = { "go.mod", ".git" },
})
vim.lsp.config("rust_analyzer", {
  cmd = { "rust-analyzer" },
  filetypes = { "rust" },
  root_markers = { "Cargo.toml", ".git" },
})
for _, name in ipairs({ "gopls", "rust_analyzer" }) do
  if vim.fn.executable(vim.lsp.config[name].cmd[1]) == 1 then
    vim.lsp.enable(name)
  end
end
`,
          ],
        ],
        "README.md": [["needs 0.10 or newer", "needs 0.11 or newer"]],
      },
    },
    {
      label: "tmux-rgb",
      message: `tmux: pass true colour through

Without the RGB feature Neovim falls back to 256 colours inside tmux
and every theme looks slightly seasick.`,
      author: "mira",
      daysAgo: 150,
      changes: {
        ".tmux.conf": [
          [
            'set -g default-terminal "tmux-256color"\n',
            'set -g default-terminal "tmux-256color"\nset -as terminal-features ",xterm-256color:RGB"\n',
          ],
        ],
      },
    },
    {
      label: "git-sign",
      message: `git: sign commits with my SSH key

Same key I already use everywhere else, so no GPG keyring to babysit.`,
      author: "mira",
      daysAgo: 61,
      changes: {
        ".gitconfig": [
          [
            "\talgorithm = histogram\n",
            "\talgorithm = histogram\n[gpg]\n\tformat = ssh\n[user]\n\tsigningkey = ~/.ssh/id_ed25519.pub\n[commit]\n\tgpgsign = true\n[tag]\n\tgpgsign = true\n",
          ],
        ],
      },
    },
    {
      label: "dry-run",
      message: `install.sh: support DRY_RUN=1

Prints what would be moved or linked without touching anything. Useful
on shared machines where I'm not sure what's already in $HOME.`,
      author: "mira",
      daysAgo: 13,
      changes: {
        "install.sh": [
          [
            "set -eu\n",
            'set -eu\n\nrun() {\n  if [ "${DRY_RUN:-0}" = 1 ]; then echo "would: $*"; else "$@"; fi\n}\n',
          ],
          [
            '  mkdir -p "$(dirname "$dst")"',
            '  run mkdir -p "$(dirname "$dst")"',
          ],
          ['    mv "$dst" "$dst.bak"', '    run mv "$dst" "$dst.bak"'],
          ['  ln -sfn "$src" "$dst"', '  run ln -sfn "$src" "$dst"'],
        ],
        "README.md": [
          [
            "- `install.sh`: symlinks the above into `$HOME`\n",
            "- `install.sh`: symlinks the above into `$HOME`; run with `DRY_RUN=1` to\n  see what it would do first\n",
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "nvim: deprecation warning on ]d / [d",
      author: "yuki",
      daysAgo: 275,
      body: "Borrowed your init.lua on 0.11 and every `]d` prints `vim.diagnostic.goto_next() is deprecated, use vim.diagnostic.jump() instead`. Not a big deal, just noisy.",
      state: "solved",
      closedHoursAfter: 170,
      comments: [
        {
          author: "mira",
          body: "Ha, I'd been ignoring it. Fixed along with the LSP setup, thanks for the nudge.",
          hoursAfter: 170,
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
      ],
    },
    {
      title: "install.sh overwrites the previous .bak",
      author: "sol",
      daysAgo: 6,
      body: `Ran install.sh twice on a new machine (once before and once after editing my local .gitconfig). The second run moved my edited \`.gitconfig\` over the first \`.gitconfig.bak\`, so the original from the machine image was gone.

Not a big loss this time, but a timestamped backup name would make it safe to re-run.`,
      labels: ["bug"],
      comments: [
        {
          author: "mira",
          body: "Oops. Yes, timestamps please. Want to send a patch?",
          hoursAfter: 3,
        },
        {
          author: "sol",
          body: "On it.",
          hoursAfter: 5,
          replyTo: 0,
        },
      ],
    },
  ],
  patches: [
    {
      title: "install.sh: timestamp backups instead of overwriting them",
      author: "sol",
      daysAgo: 5,
      state: "open",
      revisions: [
        {
          description:
            "Backups are now named `<file>.bak.<YYYYmmddHHMMSS>`, so re-running install.sh never overwrites an earlier backup. Respects DRY_RUN like the rest of the script.",
          hoursAfter: 0,
          base: "dry-run",
          commits: [
            {
              label: "sol-bak",
              message: `install.sh: timestamp backups

Re-running the script used to replace the previous .bak with whatever
was in place at the time, losing the original file.`,
              author: "sol",
              daysAgo: 5,
              changes: {
                "install.sh": [
                  [
                    '    run mv "$dst" "$dst.bak"\n    echo "backed up $dst"\n',
                    '    bak="$dst.bak.$(date +%Y%m%d%H%M%S)"\n    run mv "$dst" "$bak"\n    echo "backed up $dst to $bak"\n',
                  ],
                  [
                    "# Symlink everything into $HOME. Existing files are moved to *.bak first.",
                    "# Symlink everything into $HOME. Existing files are moved to\n# <file>.bak.<timestamp> first, so re-running never loses a backup.",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "mira",
              hoursAfter: 9,
              summary: "Thanks! Works for me. One small thing.",
              comments: [
                {
                  body: 'Running two links within the same second would collide on the name, but each file has its own path so that can\'t happen here. Fine as is. Could you echo the backup path only when not in DRY_RUN, though? Right now a dry run says "backed up" even though nothing moved.',
                  path: "install.sh",
                  line: 19,
                },
              ],
            },
          ],
          comments: [
            {
              author: "sol",
              body: "Good catch, will push a revision tonight.",
              hoursAfter: 11,
            },
          ],
        },
      ],
    },
  ],
};
