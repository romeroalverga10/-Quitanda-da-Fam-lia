$origem = $PSScriptRoot
$destino = "C:\Backups\Quitanda"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"

if (-not (Test-Path $destino)) {
    New-Item -ItemType Directory -Path $destino | Out-Null
}

$arquivos = @("quitanda.db", "config.json")
$copiados = 0

foreach ($arquivo in $arquivos) {
    $caminhoOrigem = Join-Path $origem $arquivo
    if (Test-Path $caminhoOrigem) {
        $ext = [System.IO.Path]::GetExtension($arquivo)
        $nome = [System.IO.Path]::GetFileNameWithoutExtension($arquivo)
        $destArquivo = Join-Path $destino "${nome}_${timestamp}${ext}"
        Copy-Item $caminhoOrigem $destArquivo
        $copiados++
        Write-Host "OK: $arquivo -> $destArquivo"
    } else {
        Write-Host "AVISO: $arquivo nao encontrado, pulando."
    }
}

# Manter apenas os 10 backups mais recentes do banco
$backupsDB = Get-ChildItem -Path $destino -Filter "quitanda_*.db" | Sort-Object LastWriteTime -Descending
if ($backupsDB.Count -gt 10) {
    $backupsDB | Select-Object -Skip 10 | Remove-Item -Force
    Write-Host "Backups antigos removidos (mantidos os 10 mais recentes)."
}

Write-Host ""
if ($copiados -gt 0) {
    Write-Host "Backup concluido! $copiados arquivo(s) salvos em: $destino"
} else {
    Write-Host "ERRO: Nenhum arquivo foi copiado. Verifique se o sistema esta instalado corretamente."
}
