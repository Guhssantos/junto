# Destrava o Docker Desktop no Windows quando ele fecha com
# "rename ...\*.sock ... .stale: The file cannot be accessed by the system".
# Causa: sockets deixados pela execução anterior ficam inacessíveis (comum com
# antivírus corporativo). Solução: tirar as pastas desses sockets do caminho.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/docker-reset-windows.ps1
$ErrorActionPreference = 'Stop'

Get-Process | Where-Object { $_.ProcessName -match 'docker' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$ts = Get-Date -Format yyyyMMddHHmmss
foreach ($dir in "$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine") {
  if (Test-Path $dir) {
    Rename-Item $dir "$(Split-Path $dir -Leaf).old-$ts"
    Write-Host "Movido: $dir"
  }
}
Remove-Item "$env:LOCALAPPDATA\Docker\backend.error.json" -Force -ErrorAction SilentlyContinue

Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
Write-Host 'Docker Desktop iniciado. Aguarde ~1 minuto e rode: docker info'
