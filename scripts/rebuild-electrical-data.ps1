param(
  [string]$DocxPath = "D:\RTU\coderecall-project\Final Modules and Quiz\Electrical Wiring and Electronics Circuit Component\w_answer key.docx",
  [string]$QuizOutputPath = "C:\Users\robes\Downloads\coderecall-main\coderecall-main\data\quiz-data-electrical.js",
  [string]$PosttestOutputPath = "C:\Users\robes\Downloads\coderecall-main\coderecall-main\data\electrical-posttest-data.js"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-DocxLines {
  param([string]$Path)

  $zip = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $zip.GetEntry("word/document.xml")
    $reader = [IO.StreamReader]::new($entry.Open())
    try {
      $xmlText = $reader.ReadToEnd()
    } finally {
      $reader.Close()
    }
  } finally {
    $zip.Dispose()
  }

  $xml = [xml]$xmlText
  $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($p in $xml.SelectNodes("//w:p", $ns)) {
    $texts = $p.SelectNodes(".//w:t", $ns) | ForEach-Object { $_."#text" }
    if ($texts) {
      $line = (($texts -join "") -replace "\s+", " ").Trim()
      if ($line) {
        [void]$lines.Add($line)
      }
    }
  }

  return $lines
}

function Split-ChoicesFromLine {
  param([string]$Line)

  $clean = ($Line -replace "\s+", " ").Trim()
  if (-not $clean) {
    return @()
  }

  if ($clean -match "(?i)[A-D][\.\)]\s*") {
    $matches = [regex]::Matches($clean, "(?i)([A-D])[\.\)]\s*")
    if ($matches.Count -gt 0) {
      $result = @()
      for ($i = 0; $i -lt $matches.Count; $i++) {
        $start = $matches[$i].Index + $matches[$i].Length
        $end = if ($i -lt $matches.Count - 1) { $matches[$i + 1].Index } else { $clean.Length }
        $segment = $clean.Substring($start, $end - $start).Trim()
        if ($segment) {
          $result += $segment
        }
      }
      if ($result.Count) {
        return $result
      }
    }
  }

  return @($clean)
}

function Parse-QuizSection {
  param(
    [string[]]$Lines,
    [int]$StartIndex,
    [int]$EndIndex
  )

  $levels = @{}
  $i = $StartIndex + 1

  while ($i -lt $EndIndex) {
    $line = $Lines[$i]
    if ($line -in @("TEST ITEM", "RELEVANCE", "CLARITY")) {
      $i++
      continue
    }

    if ($line -match "^(\d+)\.(\d+)\.?\s*(.*)$") {
      $level = [int]$matches[1]
      $sub = [int]$matches[2]
      $remainder = $matches[3].Trim()

      $questionParts = @()
      $optionParts = @()

      if ($remainder) {
        $split = Split-ChoicesFromLine $remainder
        if ($split.Count -gt 1 -and $remainder -match "(?i)A[\.\)]\s*") {
          $questionText = ($remainder -replace "(?i)A[\.\)].*$", "").Trim()
          if ($questionText) {
            $questionParts += $questionText
          }
          $optionParts += $split
        } else {
          $questionParts += $remainder
        }
      }

      $answer = $null
      $i++
      while ($i -lt $EndIndex) {
        $current = $Lines[$i]

        if ($current -match "^(\d+)\.(\d+)\.?\s*" -or $current -like "Electrical Wiring and Electronics Circuit Components (*") {
          break
        }

        if ($current -match "^(?i)answer\s*:\s*([A-D])$") {
          $answer = $matches[1].ToUpper()
          $i++
          break
        }

        if ($optionParts.Count -lt 4) {
          $splitParts = Split-ChoicesFromLine $current
          if ($splitParts.Count -gt 1 -or $current -match "^(?i)[A-D][\.\)]\s*") {
            $optionParts += $splitParts
          } else {
            $optionParts += $current.Trim()
          }
        } else {
          $questionParts += $current.Trim()
        }

        $i++
      }

      $choices = @($optionParts | Where-Object { $_ } | Select-Object -First 4)
      $questionText = (($questionParts -join " ") -replace "\s+", " ").Trim()

      if (-not $levels.ContainsKey($level)) {
        $levels[$level] = New-Object System.Collections.Generic.List[object]
      }

      $levels[$level].Add([pscustomobject]@{
        sub = $sub
        question = $questionText
        choices = $choices
        answer = $answer
      })

      continue
    }

    $i++
  }

  return $levels
}

function Parse-PosttestSection {
  param(
    [string[]]$Lines,
    [int]$StartIndex
  )

  $items = New-Object System.Collections.Generic.List[object]
  $i = $StartIndex + 1

  while ($i -lt $Lines.Count) {
    $line = $Lines[$i]
    if ($line -in @("TEST ITEM", "RELEVANCE", "CLARITY")) {
      $i++
      continue
    }

    if ($line -match "^(\d+)\.\s*(.*)$") {
      $number = [int]$matches[1]
      $questionParts = @($matches[2].Trim())
      $optionParts = @()
      $answer = $null
      $i++

      while ($i -lt $Lines.Count) {
        $current = $Lines[$i]
        if ($current -match "^(\d+)\.\s*" -and $current -notmatch "^(?i)answer\s*:") {
          break
        }

        if ($current -match "^(?i)answer\s*:\s*([A-D])$") {
          $answer = $matches[1].ToUpper()
          $i++
          break
        }

        if ($optionParts.Count -lt 4) {
          $splitParts = Split-ChoicesFromLine $current
          if ($splitParts.Count -gt 1 -or $current -match "^(?i)[A-D][\.\)]\s*") {
            $optionParts += $splitParts
          } else {
            $optionParts += $current.Trim()
          }
        } else {
          $questionParts += $current.Trim()
        }

        $i++
      }

      $items.Add([pscustomobject]@{
        n = $number
        question = (($questionParts -join " ") -replace "\s+", " ").Trim()
        choices = @($optionParts | Where-Object { $_ } | Select-Object -First 4)
        answer = $answer
      })

      continue
    }

    $i++
  }

  return $items
}

function ConvertTo-JsLiteral {
  param($Value, [int]$Indent = 0)

  $pad = " " * $Indent
  $childPad = " " * ($Indent + 2)

  if ($null -eq $Value) { return "null" }
  if ($Value -is [string]) {
    return '"' + ($Value -replace "\\", "\\\\" -replace '"', '\"') + '"'
  }
  if ($Value -is [bool]) { return ($Value.ToString().ToLower()) }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double]) { return [string]$Value }
  if ($Value -is [System.Collections.IDictionary]) {
    $lines = foreach ($key in $Value.Keys) {
      $childPad + $key + ": " + (ConvertTo-JsLiteral $Value[$key] ($Indent + 2))
    }
    return "{`n" + ($lines -join ",`n") + "`n" + $pad + "}"
  }
  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $properties = $Value.PSObject.Properties | Where-Object { $_.MemberType -eq "NoteProperty" -or $_.MemberType -eq "Property" }
    $lines = foreach ($prop in $properties) {
      $childPad + $prop.Name + ": " + (ConvertTo-JsLiteral $prop.Value ($Indent + 2))
    }
    return "{`n" + ($lines -join ",`n") + "`n" + $pad + "}"
  }
  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $arr = @($Value)
    if ($arr.Count -eq 0) { return "[]" }
    $items = $arr | ForEach-Object { $childPad + (ConvertTo-JsLiteral $_ ($Indent + 2)) }
    return "[`n" + ($items -join ",`n") + "`n" + $pad + "]"
  }
  return [string]$Value
}

$lines = Get-DocxLines -Path $DocxPath

$easyIndex = [array]::IndexOf($lines, "Electrical Wiring and Electronics Circuit Components (QUIZ - EASY)")
$mediumIndex = [array]::IndexOf($lines, "Electrical Wiring and Electronics Circuit Components (QUIZ - MEDIUM)")
$hardIndex = [array]::IndexOf($lines, "Electrical Wiring and Electronics Circuit Components (QUIZ - HARD)")
$postIndex = [array]::IndexOf($lines, "Electrical Wiring and Electronics Circuit Components (POST TEST)")

if ($easyIndex -lt 0 -or $mediumIndex -lt 0 -or $hardIndex -lt 0 -or $postIndex -lt 0) {
  throw "Could not find one or more electrical quiz section headers in the DOCX."
}

$easyLevels = Parse-QuizSection -Lines $lines -StartIndex $easyIndex -EndIndex $mediumIndex
$mediumLevels = Parse-QuizSection -Lines $lines -StartIndex $mediumIndex -EndIndex $hardIndex
$hardLevels = Parse-QuizSection -Lines $lines -StartIndex $hardIndex -EndIndex $postIndex
$posttestItems = Parse-PosttestSection -Lines $lines -StartIndex $postIndex

$electricalQuizData = [pscustomobject]@{
  electrical = [pscustomobject]@{
    easy = [ordered]@{}
    medium = [ordered]@{}
    hard = [ordered]@{}
  }
}

foreach ($level in ($easyLevels.Keys | Sort-Object)) {
  $electricalQuizData.electrical.easy.$level = @($easyLevels[$level] | Sort-Object sub | ForEach-Object {
    [pscustomobject]@{
      level = $level
      sub = $_.sub
      question = $_.question
      choices = $_.choices
      answer = $_.answer
    }
  })
}
foreach ($level in ($mediumLevels.Keys | Sort-Object)) {
  $electricalQuizData.electrical.medium.$level = @($mediumLevels[$level] | Sort-Object sub | ForEach-Object {
    [pscustomobject]@{
      level = $level
      sub = $_.sub
      question = $_.question
      choices = $_.choices
      answer = $_.answer
    }
  })
}
foreach ($level in ($hardLevels.Keys | Sort-Object)) {
  $electricalQuizData.electrical.hard.$level = @($hardLevels[$level] | Sort-Object sub | ForEach-Object {
    [pscustomobject]@{
      level = $level
      sub = $_.sub
      question = $_.question
      choices = $_.choices
      answer = $_.answer
    }
  })
}

$quizContent = "export const electricalQuizData = " + (ConvertTo-JsLiteral $electricalQuizData 0) + ";`n"
Set-Content -LiteralPath $QuizOutputPath -Value $quizContent -Encoding UTF8

$postContent = "export const electricalPosttestQuestions = " + (ConvertTo-JsLiteral @($posttestItems) 0) + ";`n"
Set-Content -LiteralPath $PosttestOutputPath -Value $postContent -Encoding UTF8

Write-Output ("Rebuilt electrical quiz data: easy={0}, medium={1}, hard={2}" -f $easyLevels.Count, $mediumLevels.Count, $hardLevels.Count)
Write-Output ("Rebuilt electrical posttest questions: {0}" -f $posttestItems.Count)
