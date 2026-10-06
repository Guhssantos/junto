# Liga o Junto neste computador para usar no PC e no celular (mesmo Wi-Fi).
# Uso: dois cliques em "Iniciar Junto.bat" (pasta do projeto) — ou:
#   powershell -ExecutionPolicy Bypass -File scripts/iniciar.ps1
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Test-Docker { docker info *> $null; return $LASTEXITCODE -eq 0 }

Write-Host "`n== Junto ==`n"

# 1) Docker (necessário para o banco local)
if (-not (Test-Docker)) {
  Write-Host 'Iniciando o Docker Desktop...'
  & "$PSScriptRoot\docker-reset-windows.ps1" | Out-Null
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep 5; if (Test-Docker) { $ok = $true; break } }
  if (-not $ok) { Write-Host 'O Docker não iniciou. Abra o Docker Desktop, espere ficar verde e rode de novo.' -ForegroundColor Red; Read-Host 'Enter para sair'; exit 1 }
}
Write-Host 'Docker: ok' -ForegroundColor Green

# 2) Banco local (Supabase)
npx supabase start | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Não foi possível iniciar o banco (npx supabase start).' -ForegroundColor Red; Read-Host 'Enter para sair'; exit 1 }
npx supabase migration up | Out-Null
Write-Host 'Banco: ok' -ForegroundColor Green

# 3) Endereços
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet' -and $_.IPAddress -notmatch '^(169\.254|127\.)' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host 'Computador: http://localhost:8081' -ForegroundColor Cyan
if ($ip) { Write-Host "Celular (mesmo Wi-Fi): http://$($ip):8081" -ForegroundColor Cyan }
Write-Host 'Deixe esta janela aberta enquanto usa o app. Para desligar: Ctrl+C.' -ForegroundColor Yellow
Write-Host ''

# 4) App (fica rodando nesta janela)
npx expo start --web --host lan --port 8081
