# Nyx Terminal — intégration shell bash (Git Bash, WSL, Linux)
# Charge la configuration habituelle puis émet OSC 133 (blocs de commandes) et OSC 7 (dossier courant).

if [ -n "$NYX_SHELL_LOGIN" ]; then
  unset NYX_SHELL_LOGIN
  [ -r /etc/profile ] && . /etc/profile
  if [ -r ~/.bash_profile ]; then . ~/.bash_profile
  elif [ -r ~/.bash_login ]; then . ~/.bash_login
  elif [ -r ~/.profile ]; then . ~/.profile
  fi
else
  [ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
  [ -r ~/.bashrc ] && . ~/.bashrc
fi

if [ -z "$__NYX_INTEGRATED" ]; then
  __NYX_INTEGRATED=1
  __nyx_ran=0
  __nyx_at_prompt=0

  __nyx_precmd() {
    local code=$?
    __nyx_at_prompt=0
    if [ "$__nyx_ran" = 1 ]; then printf '\e]133;D;%s\a' "$code"; else printf '\e]133;D\a'; fi
    __nyx_ran=0
    printf '\e]7;file://%s%s\a' "${HOSTNAME:-localhost}" "$PWD"
    case "$PS1" in
      *'133;A'*) ;;
      *) PS1='\[\e]133;A\a\]'"$PS1"'\[\e]133;B\a\]' ;;
    esac
    return $code
  }

  __nyx_ready() { __nyx_at_prompt=1; }

  __nyx_debug() {
    [ "$__nyx_at_prompt" = 1 ] || return
    case "$BASH_COMMAND" in __nyx_precmd*|__nyx_ready*) return ;; esac
    __nyx_at_prompt=0
    __nyx_ran=1
    printf '\e]133;C\a'
  }

  if [ -n "$PROMPT_COMMAND" ]; then
    PROMPT_COMMAND="__nyx_precmd;${PROMPT_COMMAND%;};__nyx_ready"
  else
    PROMPT_COMMAND="__nyx_precmd;__nyx_ready"
  fi
  trap '__nyx_debug' DEBUG
fi
