param(
    [switch]$Force
)

$binDir = $PSScriptRoot
$source = Join-Path $binDir "wrapper.cs"
$wrapperExe = Join-Path $binDir "wrapper.exe"

$commands = @('git', 'ls', 'npm', 'cargo', 'docker', 'pip', 'pytest', 'make', 'kubectl', 'terraform', 'agntspce')

if (-not (Test-Path $source)) {
    Write-Error "Source not found at $source"
    exit 1
}

Write-Host "Compiling wrapper.exe..." -ForegroundColor Cyan
try {
    Add-Type -TypeDefinition (Get-Content $source -Raw) -Language CSharp -OutputAssembly $wrapperExe -OutputType WindowsApplication -ErrorAction Stop
    Write-Host "  wrapper.exe created" -ForegroundColor Green
} catch {
    Write-Error "Compilation failed: $_"
    exit 1
}

foreach ($cmd in $commands) {
    $target = Join-Path $binDir "$cmd.exe"
    Copy-Item -LiteralPath $wrapperExe -Destination $target -Force:$Force
    Write-Host "  $cmd.exe created" -ForegroundColor Green
}

Write-Host "`nAll wrappers compiled successfully." -ForegroundColor Green
