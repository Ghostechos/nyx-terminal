# Nyx Terminal — intégration shell PowerShell
# Émet des séquences OSC 133 (début/fin de prompt et de commande, code de sortie)
# et OSC 9;9 (dossier courant). Injecté au démarrage via -EncodedCommand.
try {
  if ($global:__NyxIntegrated) { return }
  $global:__NyxIntegrated = $true
  $global:__NyxLastHistoryId = -1
  $global:__NyxOriginalPrompt = $function:prompt

  function global:prompt {
    $nyxOk = $global:?
    $nyxCode = $global:LASTEXITCODE
    $esc = [char]0x1b
    $bel = [char]0x07
    $out = ''
    $last = Get-History -Count 1
    if ($global:__NyxLastHistoryId -ne -1) {
      if ($last -and $last.Id -ne $global:__NyxLastHistoryId) {
        if ($nyxOk) { $c = 0 } elseif ($nyxCode) { $c = $nyxCode } else { $c = 1 }
        $out += "$esc]133;D;$c$bel"
      } else {
        $out += "$esc]133;D$bel"
      }
    }
    if ($last) { $global:__NyxLastHistoryId = $last.Id } else { $global:__NyxLastHistoryId = 0 }
    $loc = $ExecutionContext.SessionState.Path.CurrentLocation
    if ($loc.Provider.Name -eq 'FileSystem') { $out += "$esc]9;9;`"$($loc.ProviderPath)`"$bel" }
    $out += "$esc]133;A$bel"
    $out += [string](& $global:__NyxOriginalPrompt)
    $out += "$esc]133;B$bel"
    $global:LASTEXITCODE = $nyxCode
    return $out
  }

  if (-not (Get-Module PSReadLine)) { Import-Module PSReadLine -ErrorAction SilentlyContinue }
  if (Get-Command PSConsoleHostReadLine -ErrorAction SilentlyContinue) {
    $global:__NyxOriginalReadLine = $function:PSConsoleHostReadLine
    function global:PSConsoleHostReadLine {
      $line = & $global:__NyxOriginalReadLine
      [Console]::Write("$([char]0x1b)]133;C$([char]0x07)")
      $line
    }
  }
} catch { }
