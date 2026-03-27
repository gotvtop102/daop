<#
GUI launcher for creating a Capacitor app from a remote URL.
Run on Windows with: powershell -ExecutionPolicy Bypass -File ".\create-daop-app-gui.ps1"
#>

param(
  [string]$DefaultUrl = "https://example.com"
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="DAOP App Builder (Capacitor)" Height="420" Width="620"
        WindowStartupLocation="CenterScreen">
  <Grid Margin="12">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <TextBlock Grid.Row="0" FontSize="14" FontWeight="SemiBold"
               Text="Enter website URL, choose platform, click Create &amp; Open."/>

    <StackPanel Grid.Row="1" Orientation="Vertical" Margin="0,10,0,0">
      <TextBlock Text="URL web (https://...)" Margin="0,0,0,6"/>
      <TextBox Name="UrlBox" Height="30" Text="" VerticalContentAlignment="Center"/>
    </StackPanel>

    <StackPanel Grid.Row="2" Orientation="Horizontal" Margin="0,10,0,0">
      <TextBlock Text="Platform:" VerticalAlignment="Center" Margin="0,0,10,0"/>
      <ComboBox Name="PlatformBox" Width="260" SelectedIndex="0">
        <ComboBoxItem Content="Android (includes TV/TV Box)" />
        <ComboBoxItem Content="iOS (requires macOS/Xcode)" />
      </ComboBox>
    </StackPanel>

    <StackPanel Grid.Row="3" Orientation="Vertical" Margin="0,10,0,0">
      <TextBlock Text="App icon URL (png/jpg) - optional" Margin="0,0,0,6"/>
      <TextBox Name="IconBox" Height="30" Text="" VerticalContentAlignment="Center"/>
    </StackPanel>

    <TextBox Grid.Row="4" Name="LogBox" Margin="0,10,0,0"
             IsReadOnly="True" VerticalScrollBarVisibility="Auto"
             HorizontalScrollBarVisibility="Auto"
             Text="Ready.">
    </TextBox>

    <StackPanel Grid.Row="5" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,10,0,0">
      <Button Name="RunButton" Content="Create &amp; Open" Width="120" Height="30" Margin="0,0,10,0"/>
      <Button Name="BuildApkButton" Content="Build APK (Phone+TV)" Width="220" Height="30" Margin="0,0,10,0"/>
      <Button Name="TestFlightButton" Content="Build &amp; Upload TestFlight (iOS)" Width="260" Height="30" Margin="0,0,10,0"/>
      <Button Name="CloseButton" Content="Close" Width="120" Height="30"/>
    </StackPanel>
  </Grid>
</Window>
"@

function Add-Log {
  param([Parameter(Mandatory=$true)][string]$Message)
  $dispatcher.Invoke([action]{
    $logBox.AppendText($Message + "`r`n")
    $logBox.ScrollToEnd()
  }) | Out-Null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = $scriptDir
$appDir = Join-Path $rootDir "app"

$window = [Windows.Markup.XamlReader]::Parse($xaml)

$urlBox = $window.FindName("UrlBox")
$platformBox = $window.FindName("PlatformBox")
$iconBox = $window.FindName("IconBox")
$logBox = $window.FindName("LogBox")
$runButton = $window.FindName("RunButton")
$buildApkButton = $window.FindName("BuildApkButton")
$testFlightButton = $window.FindName("TestFlightButton")
$closeButton = $window.FindName("CloseButton")
$dispatcher = $window.Dispatcher

if ([string]::IsNullOrWhiteSpace($urlBox.Text) -and -not [string]::IsNullOrWhiteSpace($DefaultUrl)) {
  $urlBox.Text = $DefaultUrl
}

$closeButton.Add_Click({
  $window.Close()
})

$runButton.Add_Click({
  $runButton.IsEnabled = $false
  $closeButton.IsEnabled = $false
  $logBox.Clear()
  $logBox.AppendText("Đang khởi động...`r`n")

  $selected = ($platformBox.SelectedItem.Content).ToString()
  $platform = if ($selected -like "Android*") { "android" } else { "ios" }

  $url = $urlBox.Text.Trim()
  if (-not ($url -match '^https?://')) {
    Add-Log "URL không hợp lệ. Vui lòng nhập dạng https://..."
    $runButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  if ($platform -eq "ios" -and $env:OS -ne "Windows_NT") {
    Add-Log "iOS cần macOS. Bạn đang không chạy trên Windows."
  }

  $task = [System.Threading.Tasks.Task]::Run([Action]{
    function Invoke-Process {
      param(
        [Parameter(Mandatory=$true)][string]$FileName,
        [Parameter(Mandatory=$true)][string]$Arguments,
        [Parameter(Mandatory=$true)][string]$WorkingDirectory
      )

      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $FileName
      $psi.Arguments = $Arguments
      $psi.WorkingDirectory = $WorkingDirectory
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true

      # Inherit current env; also pass CAPACITOR_SERVER_URL for safety
      $psi.EnvironmentVariables["CAPACITOR_SERVER_URL"] = $url

      $p = New-Object System.Diagnostics.Process
      $p.StartInfo = $psi

      $null = $p.Start()

      $null = $p.BeginOutputReadLine()
      $null = $p.BeginErrorReadLine()

      $p.add_OutputDataReceived({
        if ($null -ne $_.Data) { Add-Log $_.Data }
      })
      $p.add_ErrorDataReceived({
        if ($null -ne $_.Data) { Add-Log ("[ERR] " + $_.Data) }
      })

      $p.WaitForExit()
      return $p.ExitCode
    }

    Add-Log "Thư mục app: $appDir"

    if (-not (Test-Path $appDir)) {
      Add-Log "Không tìm thấy thư mục app."
      return
    }

    if (-not (Test-Path (Join-Path $appDir "node_modules"))) {
      Add-Log "Chưa thấy `node_modules` -> chạy `npm install`..."
      $code = Invoke-Process -FileName "npm" -Arguments "install" -WorkingDirectory $appDir
      Add-Log "npm install exit code: $code"
    } else {
      Add-Log "node_modules đã có -> bỏ qua npm install."
    }

    if ($platform -eq "ios") {
      Add-Log "Chọn iOS: cần môi trường macOS để `cap open ios` chạy được."
    }

    Add-Log "Chạy tạo app cho platform: $platform"
    $code = Invoke-Process -FileName "node" -Arguments "create-app-from-url.mjs --platform $platform --url $url" -WorkingDirectory $appDir
    Add-Log "Done. Exit code: $code"
  })

  $task.ContinueWith({
    $dispatcher.Invoke([action]{
      $runButton.IsEnabled = $true
      $closeButton.IsEnabled = $true
      Add-Log "Sẵn sàng."
    }) | Out-Null
  }) | Out-Null
})

$buildApkButton.Add_Click({
  $buildApkButton.IsEnabled = $false
  $runButton.IsEnabled = $false
  $closeButton.IsEnabled = $false

  $logBox.Clear()
  $logBox.AppendText("Đang build APK Phone+TV...`r`n")

  $url = $urlBox.Text.Trim()
  if (-not ($url -match '^https?://')) {
    Add-Log "URL không hợp lệ. Vui lòng nhập dạng https://..."
    $buildApkButton.IsEnabled = $true
    $runButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  $iconUrl = $iconBox.Text.Trim()
  if ($iconUrl -ne "" -and -not ($iconUrl -match '^https?://')) {
    Add-Log "URL ảnh icon không hợp lệ. Bỏ trống hoặc nhập dạng https://..."
    $buildApkButton.IsEnabled = $true
    $runButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  $task = [System.Threading.Tasks.Task]::Run([Action]{
    function Invoke-Process {
      param(
        [Parameter(Mandatory=$true)][string]$FileName,
        [Parameter(Mandatory=$true)][string]$Arguments,
        [Parameter(Mandatory=$true)][string]$WorkingDirectory
      )

      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $FileName
      $psi.Arguments = $Arguments
      $psi.WorkingDirectory = $WorkingDirectory
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true

      $psi.EnvironmentVariables["CAPACITOR_SERVER_URL"] = $url

      $p = New-Object System.Diagnostics.Process
      $p.StartInfo = $psi

      $null = $p.Start()
      $p.add_OutputDataReceived({
        if ($null -ne $_.Data) { Add-Log $_.Data }
      })
      $p.add_ErrorDataReceived({
        if ($null -ne $_.Data) { Add-Log ("[ERR] " + $_.Data) }
      })

      # Start reading AFTER handlers are attached
      $null = $p.BeginOutputReadLine()
      $null = $p.BeginErrorReadLine()

      $p.WaitForExit()
      return $p.ExitCode
    }

    if (-not (Test-Path (Join-Path $appDir "node_modules"))) {
      Add-Log "Chưa thấy `node_modules` -> chạy `npm install`..."
      $code = Invoke-Process -FileName "npm" -Arguments "install" -WorkingDirectory $appDir
      Add-Log "npm install exit code: $code"
    } else {
      Add-Log "node_modules đã có -> bỏ qua npm install."
    }

    Add-Log "Build APK (phone + tv)... Lần đầu có thể mất 10-25 phút."
    $iconArg = ""
    if ($iconUrl -ne "") { $iconArg = "--iconUrl `"$iconUrl`"" }
    $code = Invoke-Process -FileName "node" -Arguments ("build-android-phone-tv.mjs --url `"$url`" " + $iconArg) -WorkingDirectory $appDir
    Add-Log "Done. Exit code: $code"
  })

  $task.ContinueWith({
    $dispatcher.Invoke([action]{
      $buildApkButton.IsEnabled = $true
      $runButton.IsEnabled = $true
      $closeButton.IsEnabled = $true
      Add-Log "Sẵn sàng."
    }) | Out-Null
  }) | Out-Null
})

$testFlightButton.Add_Click({
  $testFlightButton.IsEnabled = $false
  $runButton.IsEnabled = $false
  $buildApkButton.IsEnabled = $false
  $closeButton.IsEnabled = $false

  $logBox.Clear()
  $logBox.AppendText("Đang build & upload TestFlight (iOS)...`r`n")

  if ($env:OS -eq "Windows_NT") {
    Add-Log "iOS TestFlight cần chạy trên macOS (Xcode). Vui lòng chạy script trên máy macOS."
    $testFlightButton.IsEnabled = $true
    $runButton.IsEnabled = $true
    $buildApkButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  $url = $urlBox.Text.Trim()
  if (-not ($url -match '^https?://')) {
    Add-Log "URL không hợp lệ. Vui lòng nhập dạng https://..."
    $testFlightButton.IsEnabled = $true
    $runButton.IsEnabled = $true
    $buildApkButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  # Read App Store Connect API key from environment vars.
  $keyId = $env:ASC_API_KEY_ID
  $issuerId = $env:ASC_API_ISSUER_ID
  if ([string]::IsNullOrWhiteSpace($keyId) -or [string]::IsNullOrWhiteSpace($issuerId)) {
    Add-Log "Thiếu env ASC_API_KEY_ID và ASC_API_ISSUER_ID. Set các biến này trước khi chạy."
    $testFlightButton.IsEnabled = $true
    $runButton.IsEnabled = $true
    $buildApkButton.IsEnabled = $true
    $closeButton.IsEnabled = $true
    return
  }

  $task = [System.Threading.Tasks.Task]::Run([Action]{
    function Invoke-Process {
      param(
        [Parameter(Mandatory=$true)][string]$FileName,
        [Parameter(Mandatory=$true)][string]$Arguments,
        [Parameter(Mandatory=$true)][string]$WorkingDirectory
      )

      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $FileName
      $psi.Arguments = $Arguments
      $psi.WorkingDirectory = $WorkingDirectory
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true

      # Pass required env vars for TestFlight upload.
      $psi.EnvironmentVariables["ASC_API_KEY_ID"] = $keyId
      $psi.EnvironmentVariables["ASC_API_ISSUER_ID"] = $issuerId
      if (-not [string]::IsNullOrWhiteSpace($env:ASC_API_KEY_P8_PATH)) {
        $psi.EnvironmentVariables["ASC_API_KEY_P8_PATH"] = $env:ASC_API_KEY_P8_PATH
      }

      $psi.EnvironmentVariables["CAPACITOR_SERVER_URL"] = $url
      $p = New-Object System.Diagnostics.Process
      $p.StartInfo = $psi
      $null = $p.Start()
      $null = $p.BeginOutputReadLine()
      $null = $p.BeginErrorReadLine()
      $p.add_OutputDataReceived({
        if ($null -ne $_.Data) { Add-Log $_.Data }
      })
      $p.add_ErrorDataReceived({
        if ($null -ne $_.Data) { Add-Log ("[ERR] " + $_.Data) }
      })
      $p.WaitForExit()
      return $p.ExitCode
    }

    Add-Log "Bắt đầu script build-ios-testflight.mjs..."
    $code = Invoke-Process -FileName "node" -Arguments ("build-ios-testflight.mjs --url `"$url`"") -WorkingDirectory $appDir
    Add-Log "Done. Exit code: $code"
  })

  $task.ContinueWith({
    $dispatcher.Invoke([action]{
      $testFlightButton.IsEnabled = $true
      $runButton.IsEnabled = $true
      $buildApkButton.IsEnabled = $true
      $closeButton.IsEnabled = $true
      Add-Log "Sẵn sàng."
    }) | Out-Null
  }) | Out-Null
})

$window.ShowDialog() | Out-Null

