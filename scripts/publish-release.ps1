[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [string]$Message = "release: v$Version",
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Invoke-Git([string[]]$Args) {
  & git @Args
  if ($LASTEXITCODE -ne 0) { throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE" }
}

$remote = (& git remote get-url origin).Trim()
if ($remote -notmatch 'zhanfanghou-create/yjai(?:\.git)?$') {
  throw "origin is not zhanfanghou-create/yjai: $remote"
}

$branch = (& git branch --show-current).Trim()
if ($branch -ne 'main') { throw "publish must run on main, current branch is $branch" }

$package = Get-Content package.json -Raw | ConvertFrom-Json
$installer = Get-Content installer-ui/package.json -Raw | ConvertFrom-Json
if ($package.version -ne $Version -or $installer.version -ne $Version) {
  throw "package.json and installer-ui/package.json must both be version $Version"
}

Invoke-Git @('fetch', 'origin', 'main')
$status = @(git status --porcelain)
$ahead = git rev-list --count 'HEAD..origin/main'
$behind = git rev-list --count 'origin/main..HEAD'
if ([int]$ahead -gt 0 -and $status.Count -gt 0) {
  throw 'origin/main is ahead and the worktree is dirty; integrate it before publishing'
}
if ($status.Count -eq 0 -and [int]$ahead -gt 0) { Invoke-Git @('merge', '--ff-only', 'origin/main') }
if ([int]$behind -gt 0) { Write-Warning "local main is ahead of origin by $behind commit(s)" }

if (-not $SkipBuild) {
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'renderer typecheck failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'application build failed' }
}

# Stage project files explicitly so local helper scripts and credentials cannot enter the commit.
Invoke-Git @('add', '-u')
Invoke-Git @('add', '.github', 'build', 'installer-ui', 'public', 'scripts', 'src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.main.json', 'tsconfig.renderer.json', 'vite.config.ts', 'RELEASE_RUNBOOK.md')

$forbidden = @(git diff --cached --name-only | Where-Object {
  $_ -match '(^|/)(\.env|\.secrets)(\.|/|$)|token|password|secret|access[_-]?key|ssh_out|(^|/)tmp([/_-]|$)|(^|/)(dist[^/]*|release)(/|$)'
})
if ($forbidden.Count -gt 0) { throw "sensitive or generated files are staged: $($forbidden -join ', ')" }

$null = git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { throw 'no staged project changes to publish' }
Invoke-Git @('commit', '-m', $Message)
Invoke-Git @('push', 'origin', 'main')

$tag = "v$Version-stable"
if ((git tag --list $tag)) { throw "tag already exists: $tag" }
Invoke-Git @('tag', '-a', $tag, '-m', "艺镜 AI 无限画布 $tag")
Invoke-Git @('push', 'origin', $tag)
Write-Host "Published source commit and tag $tag. GitHub Actions now owns the three-platform release sync."
