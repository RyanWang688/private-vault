<#
  把网站导出的同步包 (vault-sync-*.zip / vault-backup-*.zip) 应用到这个仓库，并推送到 GitHub。

  用法（在 PowerShell 里）:
    powershell -ExecutionPolicy Bypass -File D:\workshop\private-vault\tools\apply-sync.ps1 "D:\chrome下载\vault-sync-20261118-1200.zip"

  它会:
    1. 检查同步包里只有 vault.json / manifest.json / blobs/<编号>.bin（全是密文）
    2. 覆盖仓库里的 vault.json，加入新的 blobs/*.bin
    3. 删除仓库里已不再被 manifest 引用的 blobs/*.bin（对应被删掉的文件）
    4. git commit + push（使用 GitHub Desktop 自带的 git）
#>
param([Parameter(Mandatory = $true)][string]$ZipPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $ZipPath)) { throw "找不到同步包: $ZipPath" }
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ZipPath))
try {
  $names = $zip.Entries | ForEach-Object FullName
  foreach ($n in $names) {
    if ($n -notmatch '^(vault\.json|manifest\.json|blobs/[A-Za-z0-9]{6,40}\.bin)$') { throw "同步包里有意外的文件: $n（已停止，未做任何修改）" }
  }
  if ($names -notcontains 'vault.json') { throw '同步包里没有 vault.json' }

  # vault.json 必须是加密信封
  $vjEntry = $zip.GetEntry('vault.json')
  $reader = New-Object IO.StreamReader($vjEntry.Open(), [Text.Encoding]::UTF8)
  $vjText = $reader.ReadToEnd(); $reader.Close()
  $vj = $vjText | ConvertFrom-Json
  if ($vj.v -ne 2 -or -not $vj.ct -or -not $vj.iv -or -not $vj.salt) { throw 'vault.json 不是加密格式，已停止' }

  $manifest = $null
  if ($names -contains 'manifest.json') {
    $r2 = New-Object IO.StreamReader($zip.GetEntry('manifest.json').Open(), [Text.Encoding]::UTF8)
    $manifest = $r2.ReadToEnd() | ConvertFrom-Json; $r2.Close()
  }

  $blobDir = Join-Path $repo 'blobs'
  if (-not (Test-Path $blobDir)) { New-Item -ItemType Directory $blobDir | Out-Null }
  [IO.File]::WriteAllText((Join-Path $repo 'vault.json'), $vjText, (New-Object Text.UTF8Encoding $false))
  $added = 0
  foreach ($e in $zip.Entries | Where-Object { $_.FullName -like 'blobs/*' }) {
    [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $blobDir $e.Name), $true); $added++
  }
  $removed = 0
  if ($manifest -and $manifest.blobs) {
    $keep = @{}; foreach ($id in $manifest.blobs) { $keep["$id.bin"] = $true }
    foreach ($f in Get-ChildItem $blobDir -Filter *.bin) { if (-not $keep.ContainsKey($f.Name)) { Remove-Item -LiteralPath $f.FullName; $removed++ } }
    $missing = @($manifest.blobs | Where-Object { -not (Test-Path (Join-Path $blobDir "$_.bin")) })
    if ($missing.Count) { Write-Warning "仓库里还缺 $($missing.Count) 个文件（可能在更早的同步包里没上传）。可以在网站“设置 → 导出完整备份”后再运行一次本脚本。" }
  }
} finally { $zip.Dispose() }

$git = (Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" |
  Sort-Object { [version]($_.FullName -replace '.*app-([\d.]+).*', '$1') } -Descending | Select-Object -First 1).FullName
if (-not $git) { $git = 'git' }
& $git -C $repo -c core.autocrlf=false add vault.json blobs
& $git -C $repo commit -q -m "Sync vault: +$added files, -$removed files"
& $git -C $repo push -q origin main
if ($LASTEXITCODE -ne 0) { throw "已在本地提交（新增 $added 个文件，删除 $removed 个文件），但推送到 GitHub 失败。请检查网络或 GitHub 登录后，在 GitHub Desktop 里点 Push。" }
Write-Host "完成：更新 vault.json，新增 $added 个文件，删除 $removed 个文件，已推送到 GitHub。"
