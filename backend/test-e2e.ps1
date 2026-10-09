# ============================================================================
# CIVIC INFRA MAPPER — Full terminal test suite
# ============================================================================

$BACKEND = 'http://localhost:3000'
$FRONTEND = 'http://localhost:5500'

$script:pass = 0
$script:fail = 0
$script:failures = @()

function Section($title) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkGray
  Write-Host "  $title" -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkGray
}

function Check($name, $condition, $actual = '') {
  if ($condition) {
    Write-Host "  [PASS] $name" -ForegroundColor Green
    $script:pass++
  } else {
    $msg = if ($actual) { "  [FAIL] $name  -> $actual" } else { "  [FAIL] $name" }
    Write-Host $msg -ForegroundColor Red
    $script:fail++
    $script:failures += $name
  }
}

function Try-Request($method, $url, $body = $null, $useSession = $null) {
  try {
    $params = @{
      Uri = $url
      Method = $method
      UseBasicParsing = $true
    }
    if ($body) {
      $params.Body = $body
      $params.ContentType = 'application/json'
    }
    if ($useSession) { $params.WebSession = $useSession }
    $resp = Invoke-WebRequest @params
    return @{ Status = $resp.StatusCode; Body = $resp.Content; Error = $null }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body = ''
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
    } catch {}
    return @{ Status = $status; Body = $body; Error = $_.Exception.Message }
  }
}

# ----------------------------------------------------------------------------
Section "1. Backend service is up"
# ----------------------------------------------------------------------------
$r = Try-Request 'GET' "$BACKEND/health"
Check "GET /health returns 200" ($r.Status -eq 200) "got $($r.Status)"
Check "Response mentions supabase" ($r.Body -match 'supabase') "body: $($r.Body)"

# ----------------------------------------------------------------------------
Section "2. Public endpoints (no auth)"
# ----------------------------------------------------------------------------
$r = Try-Request 'GET' "$BACKEND/api/config"
Check "GET /api/config returns 200" ($r.Status -eq 200)
Check "Config includes supabaseUrl" ($r.Body -match 'supabaseUrl')

$r = Try-Request 'GET' "$BACKEND/api/reports"
Check "GET /api/reports returns 200" ($r.Status -eq 200)

$r = Try-Request 'GET' "$BACKEND/api/stats"
Check "GET /api/stats returns 200" ($r.Status -eq 200)
Check "Stats include total" ($r.Body -match '"total"')
Check "Stats include surveyCount" ($r.Body -match '"surveyCount"')

$r = Try-Request 'GET' "$BACKEND/api/surveys"
Check "GET /api/surveys returns 200" ($r.Status -eq 200)

$r = Try-Request 'GET' "$BACKEND/api/surveys/stats"
Check "GET /api/surveys/stats returns 200" ($r.Status -eq 200)

# ----------------------------------------------------------------------------
Section "3. Auth guards (must reject anonymous)"
# ----------------------------------------------------------------------------
$r = Try-Request 'GET' "$BACKEND/api/auth/me"
Check "GET /api/auth/me without cookie -> 200 with null user" ($r.Status -eq 200 -and $r.Body -match '"user":null')

$r = Try-Request 'GET' "$BACKEND/api/me/reports"
Check "GET /api/me/reports without auth -> 401" ($r.Status -eq 401) "got $($r.Status)"

$r = Try-Request 'POST' "$BACKEND/api/reports" '{"category":"Road","description":"x"}'
Check "POST /api/reports without auth -> 401" ($r.Status -eq 401) "got $($r.Status)"

$r = Try-Request 'POST' "$BACKEND/api/surveys" '{"roads":3,"drainage":3,"streetlights":3,"waste":3,"water":3,"footpaths":3}'
Check "POST /api/surveys without auth -> 401" ($r.Status -eq 401) "got $($r.Status)"

# ----------------------------------------------------------------------------
Section "4. Register + login flow"
# ----------------------------------------------------------------------------
$testEmail = "termtest$(Get-Random)@example.com"
$testPass  = 'termtest12345'

$regBody = @{ name = 'Terminal Test'; email = $testEmail; password = $testPass } | ConvertTo-Json
$r = Try-Request 'POST' "$BACKEND/api/auth/register" $regBody
Check "POST /api/auth/register -> 201" ($r.Status -eq 201) "got $($r.Status)"

$r = Try-Request 'POST' "$BACKEND/api/auth/register" $regBody
Check "POST /api/auth/register (duplicate) -> 409" ($r.Status -eq 409) "got $($r.Status)"

$r = Try-Request 'POST' "$BACKEND/api/auth/register" '{"name":"X","email":"bad","password":"short"}'
Check "POST /api/auth/register (bad input) -> 400" ($r.Status -eq 400) "got $($r.Status)"

$loginBody = @{ email = $testEmail; password = $testPass } | ConvertTo-Json
$r = Try-Request 'POST' "$BACKEND/api/auth/login" $loginBody
Check "POST /api/auth/login -> 200" ($r.Status -eq 200) "got $($r.Status)"

# Log in with a session for the authenticated tests below
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-WebRequest -Uri "$BACKEND/api/auth/login" -Method POST `
  -Body $loginBody -ContentType 'application/json' -WebSession $session

$r = Try-Request 'GET' "$BACKEND/api/auth/me" $null $session
Check "GET /api/auth/me with session -> user present" ($r.Body -match [regex]::Escape($testEmail))

# ----------------------------------------------------------------------------
Section "5. Report submission (authenticated)"
# ----------------------------------------------------------------------------
$reportBody = @{
  category = 'Road'
  description = "Terminal test report $(Get-Date -Format 'HHmmss')"
  address = 'Test Street'
  latitude = 20.2738
  longitude = 73.0169
  severity = 'Medium'
} | ConvertTo-Json

$r = Try-Request 'POST' "$BACKEND/api/reports" $reportBody $session
Check "POST /api/reports (auth) -> 201" ($r.Status -eq 201) "got $($r.Status)"

# Bad latitude
$r = Try-Request 'POST' "$BACKEND/api/reports" '{"category":"Road","description":"x","latitude":200,"longitude":73}' $session
Check "POST /api/reports (bad latitude) -> 400" ($r.Status -eq 400) "got $($r.Status)"

# Bad category
$r = Try-Request 'POST' "$BACKEND/api/reports" '{"category":"Fake","description":"x"}' $session
Check "POST /api/reports (bad category) -> 400" ($r.Status -eq 400) "got $($r.Status)"

# ----------------------------------------------------------------------------
Section "6. Survey submission (authenticated)"
# ----------------------------------------------------------------------------
$surveyBody = @{
  area = 'Test Ward'
  roads = 4; drainage = 3; streetlights = 2
  waste = 5; water = 3; footpaths = 4
  biggest_problem = 'Drainage'
  suggestion = 'Fix storm drains.'
} | ConvertTo-Json

$r = Try-Request 'POST' "$BACKEND/api/surveys" $surveyBody $session
Check "POST /api/surveys (auth) -> 201" ($r.Status -eq 201) "got $($r.Status)"

$r = Try-Request 'POST' "$BACKEND/api/surveys" '{"roads":99}' $session
Check "POST /api/surveys (bad rating) -> 400" ($r.Status -eq 400) "got $($r.Status)"

# ----------------------------------------------------------------------------
Section "7. Admin guards (regular user denied)"
# ----------------------------------------------------------------------------
$r = Try-Request 'PATCH' "$BACKEND/api/reports/1" '{"status":"Resolved"}' $session
Check "PATCH /api/reports/:id as non-admin -> 403" ($r.Status -eq 403) "got $($r.Status)"

$r = Try-Request 'DELETE' "$BACKEND/api/reports/1" $null $session
Check "DELETE /api/reports/:id as non-admin -> 403" ($r.Status -eq 403) "got $($r.Status)"

# ----------------------------------------------------------------------------
Section "8. Frontend server"
# ----------------------------------------------------------------------------
$pages = @('index.html', 'report.html', 'reports.html', 'survey.html', 'admin.html', 'account.html')
foreach ($page in $pages) {
  $r = Try-Request 'GET' "$FRONTEND/$page"
  Check "GET /$page -> 200" ($r.Status -eq 200) "got $($r.Status)"
}

foreach ($asset in @('css/style.css', 'js/common.js', 'js/config.js', 'js/index.js', 'js/report.js', 'js/reports.js', 'js/survey.js', 'js/admin.js', 'js/account.js')) {
  $r = Try-Request 'GET' "$FRONTEND/$asset"
  Check "GET /$asset -> 200" ($r.Status -eq 200) "got $($r.Status)"
}

# ----------------------------------------------------------------------------
Section "9. Favicon uniqueness (each HTML should have exactly 1)"
# ----------------------------------------------------------------------------
Push-Location "C:\Users\admin\Downloads\CEP WEBSITE PKD\CEP WEBSITE PKD\frontend"
$faviconCounts = Select-String -Path *.html -Pattern 'rel="icon"' | Group-Object Filename
foreach ($f in $faviconCounts) {
  Check "$($f.Name) has exactly 1 favicon link" ($f.Count -eq 1) "count: $($f.Count)"
}
Pop-Location

# ----------------------------------------------------------------------------
Section "10. Database via API"
# ----------------------------------------------------------------------------
$r = Try-Request 'GET' "$BACKEND/api/reports?page=1&pageSize=5"
Check "GET /api/reports (paginated) -> 200" ($r.Status -eq 200)

$r = Try-Request 'GET' "$BACKEND/api/reports?page=0"
Check "GET /api/reports (bad page) -> 400" ($r.Status -eq 400)

$r = Try-Request 'GET' "$BACKEND/api/reports/999999"
Check "GET /api/reports/999999 -> 404" ($r.Status -eq 404)

# ----------------------------------------------------------------------------
Section "11. Logout"
# ----------------------------------------------------------------------------
$r = Try-Request 'POST' "$BACKEND/api/auth/logout" $null $session
Check "POST /api/auth/logout -> 200" ($r.Status -eq 200)

$r = Try-Request 'GET' "$BACKEND/api/auth/me" $null $session
Check "GET /api/auth/me after logout -> null user" ($r.Body -match '"user":null')

# ----------------------------------------------------------------------------
Section "Results"
# ----------------------------------------------------------------------------
$total = $script:pass + $script:fail
Write-Host ""
Write-Host "  Total:  $total"
Write-Host "  Passed: $($script:pass)" -ForegroundColor Green
Write-Host "  Failed: $($script:fail)" -ForegroundColor $(if ($script:fail -eq 0) { 'Green' } else { 'Red' })
if ($script:failures.Count -gt 0) {
  Write-Host ""
  Write-Host "  Failures:" -ForegroundColor Red
  $script:failures | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
}
Write-Host ""