<?php
/**
 * ANOMALY ANALYSIS ENGINE — shared between parity.php and parity_div.php
 *
 * Server-side timing-data confidence and anomaly detection.
 * Three layers:
 *   Layer 1: Hard integrity checks (missing splits, non-monotonic, zero/negative)
 *   Layer 2: Local shape / adjacent-split consistency
 *   Layer 3: Historical baseline comparison (robust stats, hierarchical peers)
 *
 * Mirrors the TypeScript engine in src/domain/parity/anomalyEngine.ts but
 * runs server-side as the authoritative source of truth.
 *
 * NITRO CLASS CONVENTION:
 * Top Fuel and Funny Car run to 1000 ft. The timing system often reports
 * the effective finish time/mph in ft1320/mph1320 fields with ft1000 blank.
 * This is a known convention, NOT corrupt data.
 */

// ── Nitro Class Detection ────────────────────────────────────────────────

function anomaly_isNitroClass(array $run): bool {
    $cat = strtoupper(trim($run['category'] ?? ''));
    $cls = strtoupper(trim($run['class_index'] ?? ''));
    return in_array($cat, ['TOP FUEL', 'FUNNY CAR'], true)
        || in_array($cls, ['TF', 'FC', 'TFD'], true);
}

// ── Normalized Finish Model ──────────────────────────────────────────────

function anomaly_resolveFinish(array $run): array {
    $nitro = anomaly_isNitroClass($run);
    $g = function(string $f) use ($run): ?float {
        $v = $run[$f] ?? null;
        return ($v !== null && (float)$v > 0) ? (float)$v : null;
    };

    if ($nitro) {
        $ft1000 = $g('ft1000');
        $mph1000 = $g('mph1000');
        $ft1320 = $g('ft1320');
        $mph1320 = $g('mph1320');

        if ($ft1000 !== null) {
            return [
                'effectiveFinishDistance' => 1000,
                'effectiveFinishTime' => $ft1000,
                'effectiveFinishMph' => $mph1000 ?? $mph1320,
                'finishTimeField' => 'ft1000',
                'finishMphField' => $mph1000 !== null ? 'mph1000' : 'mph1320',
                'isNitro' => true,
            ];
        }
        return [
            'effectiveFinishDistance' => 1000,
            'effectiveFinishTime' => $ft1320,
            'effectiveFinishMph' => $mph1320,
            'finishTimeField' => 'ft1320',
            'finishMphField' => 'mph1320',
            'isNitro' => true,
        ];
    }

    return [
        'effectiveFinishDistance' => 1320,
        'effectiveFinishTime' => $g('ft1320'),
        'effectiveFinishMph' => $g('mph1320'),
        'finishTimeField' => 'ft1320',
        'finishMphField' => 'mph1320',
        'isNitro' => false,
    ];
}

// ── Timing Fields & Intervals ────────────────────────────────────────────

function anomaly_cumulativeFields(): array {
    return ['ft60', 'ft330', 'ft660', 'ft1000', 'ft1320'];
}

function anomaly_timingFields(): array {
    return ['ft60', 'ft330', 'ft660', 'ft1000', 'ft1320', 'mph660', 'mph1320', 'rt'];
}

function anomaly_intervalSegmentsFull(): array {
    return [
        ['key' => 't_0_60',      'label' => '0–60 ft',     'from' => null,     'to' => 'ft60'],
        ['key' => 't_60_330',    'label' => '60–330 ft',   'from' => 'ft60',   'to' => 'ft330'],
        ['key' => 't_330_660',   'label' => '330–660 ft',  'from' => 'ft330',  'to' => 'ft660'],
        ['key' => 't_660_1000',  'label' => '660–1000 ft', 'from' => 'ft660',  'to' => 'ft1000'],
        ['key' => 't_1000_1320', 'label' => '1000–ET',     'from' => 'ft1000', 'to' => 'ft1320'],
    ];
}

function anomaly_intervalSegmentsNitro(): array {
    return [
        ['key' => 't_0_60',       'label' => '0–60 ft',     'from' => null,    'to' => 'ft60'],
        ['key' => 't_60_330',     'label' => '60–330 ft',   'from' => 'ft60',  'to' => 'ft330'],
        ['key' => 't_330_660',    'label' => '330–660 ft',  'from' => 'ft330', 'to' => 'ft660'],
        ['key' => 't_660_finish', 'label' => '660–Finish',  'from' => 'ft660', 'to' => '_finish'],
    ];
}

function anomaly_getIntervalSegments(array $run): array {
    return anomaly_isNitroClass($run) ? anomaly_intervalSegmentsNitro() : anomaly_intervalSegmentsFull();
}

function anomaly_intervalSegments(): array {
    return anomaly_intervalSegmentsFull();
}

function anomaly_severityPenalty(string $sev): int {
    return ['critical' => 25, 'high' => 15, 'medium' => 8, 'low' => 3, 'info' => 0][$sev] ?? 0;
}

function anomaly_confidenceBand(int $score): string {
    if ($score >= 80) return 'High';
    if ($score >= 55) return 'Medium';
    if ($score >= 30) return 'Low';
    return 'Critical';
}

function anomaly_computeIntervals(array $run): array {
    $g = function(string $f) use ($run): ?float {
        $v = $run[$f] ?? null;
        return ($v !== null && (float)$v > 0) ? (float)$v : null;
    };
    $sub = function(?float $a, ?float $b): ?float {
        return ($a !== null && $b !== null && $a > $b) ? round($a - $b, 6) : null;
    };
    $finish = anomaly_resolveFinish($run);
    return [
        't_0_60'       => $g('ft60'),
        't_60_330'     => $sub($g('ft330'), $g('ft60')),
        't_330_660'    => $sub($g('ft660'), $g('ft330')),
        't_660_1000'   => $sub($g('ft1000'), $g('ft660')),
        't_1000_1320'  => $sub($g('ft1320'), $g('ft1000')),
        't_660_finish' => $sub($finish['effectiveFinishTime'], $g('ft660')),
    ];
}

// ── Robust Statistics ────────────────────────────────────────────────────

function anomaly_median(array $sorted): float {
    $n = count($sorted);
    if ($n === 0) return 0;
    if ($n % 2 === 1) return $sorted[intdiv($n, 2)];
    return ($sorted[$n / 2 - 1] + $sorted[$n / 2]) / 2;
}

function anomaly_mad(array $values): array {
    if (empty($values)) return ['median' => 0, 'mad' => 0];
    sort($values);
    $med = anomaly_median($values);
    $deviations = array_map(fn($v) => abs($v - $med), $values);
    sort($deviations);
    return ['median' => $med, 'mad' => anomaly_median($deviations)];
}

function anomaly_iqrBounds(array $values, float $k = 1.5): array {
    sort($values);
    $n = count($values);
    $q1 = $values[(int)floor($n * 0.25)];
    $q3 = $values[(int)floor($n * 0.75)];
    $iqr = $q3 - $q1;
    return ['q1' => $q1, 'q3' => $q3, 'lower' => $q1 - $k * $iqr, 'upper' => $q3 + $k * $iqr];
}

function anomaly_modifiedZScore(float $value, float $med, float $madVal): float {
    if ($madVal == 0) return 0;
    return 0.6745 * ($value - $med) / $madVal;
}

// ── Layer 1: Hard Integrity ──────────────────────────────────────────────

function anomaly_layer1(array $run, array $intervals): array {
    $flags = [];
    $nitro = anomaly_isNitroClass($run);
    $finish = anomaly_resolveFinish($run);
    $timingFields = anomaly_timingFields();

    $g = function(string $f) use ($run): ?float {
        $v = $run[$f] ?? null;
        return ($v !== null) ? (float)$v : null;
    };

    $expectedChain = $nitro
        ? ['ft60', 'ft330', 'ft660']
        : ['ft60', 'ft330', 'ft660', 'ft1000', 'ft1320'];

    $splits = [];
    foreach ($expectedChain as $f) {
        $splits[] = ['field' => $f, 'val' => $g($f)];
    }
    $lastPresent = -1;
    for ($i = count($splits) - 1; $i >= 0; $i--) {
        if ($splits[$i]['val'] !== null) { $lastPresent = $i; break; }
    }
    if ($finish['effectiveFinishTime'] !== null && $lastPresent < 0) $lastPresent = 0;
    if ($lastPresent > 0) {
        for ($i = 0; $i < $lastPresent; $i++) {
            if ($splits[$i]['val'] === null) {
                $flags[] = [
                    'code' => 'MISSING_SPLIT_VALUE', 'severity' => 'high',
                    'field' => $splits[$i]['field'],
                    'explanation' => "{$splits[$i]['field']} is missing but later splits exist",
                ];
            }
        }
    }

    foreach ($timingFields as $f) {
        if ($f === 'rt') continue;
        $v = $g($f);
        if ($v !== null && $v <= 0) {
            $flags[] = [
                'code' => 'ZERO_OR_NEGATIVE_TIMING', 'severity' => 'critical',
                'field' => $f, 'value' => $v,
                'explanation' => "$f = $v is zero or negative",
            ];
        }
    }

    $pairs = $nitro
        ? [['ft60','ft330'],['ft330','ft660']]
        : [['ft60','ft330'],['ft330','ft660'],['ft660','ft1000'],['ft1000','ft1320']];

    if ($nitro && $finish['effectiveFinishTime'] !== null && $g('ft660') !== null) {
        $ft660 = $g('ft660');
        if ($finish['effectiveFinishTime'] <= $ft660) {
            $flags[] = [
                'code' => 'NON_MONOTONIC_SPLITS', 'severity' => 'critical',
                'field' => $finish['finishTimeField'],
                'value' => $finish['effectiveFinishTime'],
                'expected' => "> $ft660 (ft660)",
                'explanation' => "Finish time ({$finish['effectiveFinishTime']}) in {$finish['finishTimeField']} is not greater than ft660 ($ft660)",
            ];
        }
    }
    foreach ($pairs as [$earlier, $later]) {
        $vE = $g($earlier);
        $vL = $g($later);
        if ($vE !== null && $vL !== null && $vL <= $vE) {
            $flags[] = [
                'code' => 'NON_MONOTONIC_SPLITS', 'severity' => 'critical',
                'field' => $later, 'value' => $vL,
                'expected' => "> $vE ($earlier)",
                'explanation' => "$later ($vL) is not greater than $earlier ($vE)",
            ];
        }
    }

    foreach (anomaly_getIntervalSegments($run) as $seg) {
        $v = $intervals[$seg['key']] ?? null;
        if ($v !== null && $v <= 0) {
            $flags[] = [
                'code' => 'INVALID_INTERVAL', 'severity' => 'critical',
                'field' => $seg['key'], 'value' => $v,
                'explanation' => "Interval {$seg['label']} = " . round($v, 4) . "s is not positive",
            ];
        }
    }

    $dupFields = [];
    foreach ($expectedChain as $f) {
        $dupFields[] = ['field' => $f, 'val' => $g($f)];
    }
    if ($finish['effectiveFinishTime'] !== null) {
        $dupFields[] = ['field' => $finish['finishTimeField'], 'val' => $finish['effectiveFinishTime']];
    }
    $presentSplits = array_values(array_filter($dupFields, fn($s) => $s['val'] !== null));
    for ($i = 0; $i < count($presentSplits); $i++) {
        for ($j = $i + 1; $j < count($presentSplits); $j++) {
            if ($presentSplits[$i]['val'] == $presentSplits[$j]['val'] && $presentSplits[$i]['field'] !== $presentSplits[$j]['field']) {
                $flags[] = [
                    'code' => 'DUPLICATE_SPLIT_VALUES', 'severity' => 'high',
                    'field' => "{$presentSplits[$i]['field']}/{$presentSplits[$j]['field']}",
                    'value' => $presentSplits[$i]['val'],
                    'explanation' => "{$presentSplits[$i]['field']} and {$presentSplits[$j]['field']} have identical values ({$presentSplits[$i]['val']})",
                ];
            }
        }
    }

    if ($finish['effectiveFinishTime'] === null && $g('ft60') === null) {
        $flags[] = [
            'code' => 'INCOMPLETE_RUN_DATA', 'severity' => 'medium',
            'explanation' => 'Run has no timing data (no 60 ft, no finish ET)',
        ];
    } elseif ($finish['effectiveFinishTime'] === null) {
        $flags[] = [
            'code' => 'INCOMPLETE_RUN_DATA', 'severity' => 'medium',
            'explanation' => 'Run has no finish ET — likely an aborted or partial run',
        ];
    }

    return $flags;
}

// ── Layer 2: Shape Consistency ───────────────────────────────────────────

function anomaly_layer2(array $run, array $intervals): array {
    $flags = [];
    $segments = anomaly_getIntervalSegments($run);

    $present = [];
    foreach ($segments as $seg) {
        $v = $intervals[$seg['key']] ?? null;
        if ($v !== null && $v > 0) {
            $present[] = ['key' => $seg['key'], 'val' => $v, 'label' => $seg['label']];
        }
    }

    if (count($present) < 3) return $flags;

    $nitro = anomaly_isNitroClass($run);
    for ($i = 0; $i < count($present); $i++) {
        if ($nitro && $present[$i]['key'] === 't_660_finish') continue;

        $neighbors = [];
        if ($i > 0 && !($nitro && $present[$i - 1]['key'] === 't_660_finish')) $neighbors[] = $present[$i - 1]['val'];
        if ($i < count($present) - 1 && !($nitro && $present[$i + 1]['key'] === 't_660_finish')) $neighbors[] = $present[$i + 1]['val'];
        if (empty($neighbors)) continue;

        $avgNeighbor = array_sum($neighbors) / count($neighbors);
        $ratio = $present[$i]['val'] / $avgNeighbor;

        if ($ratio > 3.0 || $ratio < 0.15) {
            $flags[] = [
                'code' => 'SEGMENT_SHAPE_INCONSISTENT', 'severity' => 'high',
                'field' => $present[$i]['key'], 'value' => $present[$i]['val'],
                'expected' => '~' . round($avgNeighbor, 4) . 's based on adjacent segments',
                'explanation' => "{$present[$i]['label']} (" . round($present[$i]['val'], 4) . "s) is " . round($ratio, 1) . "x adjacent segments — likely isolated timing error",
            ];
        } elseif ($ratio > 2.2 || $ratio < 0.25) {
            $flags[] = [
                'code' => 'SEGMENT_SHAPE_INCONSISTENT', 'severity' => 'medium',
                'field' => $present[$i]['key'], 'value' => $present[$i]['val'],
                'expected' => '~' . round($avgNeighbor, 4) . 's based on adjacent segments',
                'explanation' => "{$present[$i]['label']} (" . round($present[$i]['val'], 4) . "s) is " . round($ratio, 1) . "x adjacent segments — somewhat unusual",
            ];
        }
    }

    $finish = anomaly_resolveFinish($run);
    $mph660 = isset($run['mph660']) ? (float)$run['mph660'] : null;
    $finishMph = $finish['effectiveFinishMph'];
    if ($mph660 !== null && $finishMph !== null && $mph660 > 0 && $finishMph > 0) {
        if ($finishMph < $mph660 * 0.5) {
            $flags[] = [
                'code' => 'MPH_ET_INCONSISTENT', 'severity' => 'medium',
                'field' => $finish['finishMphField'], 'value' => $finishMph,
                'expected' => '>= ~' . round($mph660 * 0.7, 1) . ' mph based on 660 mph',
                'explanation' => "Finish mph ($finishMph) is less than half of 660 mph ($mph660) — possible timing/recording issue or mid-track shutoff",
            ];
        }
    }

    return $flags;
}

// ── Layer 3: Historical Baseline ─────────────────────────────────────────

function anomaly_buildBaselines(array $cleanRuns): array {
    $stats = [];
    $timingFields = anomaly_timingFields();

    foreach ($timingFields as $f) {
        $values = [];
        foreach ($cleanRuns as $r) {
            $v = $r[$f] ?? null;
            if ($v !== null && (float)$v > 0) $values[] = (float)$v;
        }
        if (count($values) < 3) continue;
        $m = anomaly_mad($values);
        $bounds = anomaly_iqrBounds($values, 2.0);
        $stats[$f] = array_merge(['field' => $f, 'n' => count($values)], $m, $bounds);
    }

    $allIntervals = array_map('anomaly_computeIntervals', $cleanRuns);
    $allSegments = array_merge(anomaly_intervalSegmentsFull(), anomaly_intervalSegmentsNitro());
    $seenKeys = [];
    foreach ($allSegments as $seg) {
        if (isset($seenKeys[$seg['key']])) continue;
        $seenKeys[$seg['key']] = true;
        $values = [];
        foreach ($allIntervals as $iv) {
            $v = $iv[$seg['key']] ?? null;
            if ($v !== null && $v > 0) $values[] = $v;
        }
        if (count($values) < 3) continue;
        $m = anomaly_mad($values);
        $bounds = anomaly_iqrBounds($values, 2.0);
        $stats[$seg['key']] = array_merge(['field' => $seg['key'], 'n' => count($values)], $m, $bounds);
    }

    return $stats;
}

function anomaly_selectPeers(array $targetRun, array $allRuns, array $cleanIds): array {
    $category = $targetRun['category'] ?? null;
    $raceLookup = $targetRun['race_lookup'] ?? null;
    $driver = $targetRun['driver_name'] ?? null;
    $classIdx = $targetRun['class_index'] ?? null;
    $combo = ($driver && $classIdx) ? "$driver|$classIdx" : $driver;
    $targetId = (int)$targetRun['id'];

    $clean = array_filter($allRuns, fn($r) => (int)$r['id'] !== $targetId && isset($cleanIds[(int)$r['id']]));

    $resolveCombo = function(array $r) {
        $d = $r['driver_name'] ?? null;
        $c = $r['class_index'] ?? null;
        return ($d && $c) ? "$d|$c" : $d;
    };

    if ($combo && $category && $raceLookup) {
        $peers = array_filter($clean, fn($r) =>
            $resolveCombo($r) === $combo && ($r['category'] ?? null) === $category && ($r['race_lookup'] ?? null) === $raceLookup
        );
        if (count($peers) >= 5) return ['peers' => array_values($peers), 'scope' => 'combo+category+event'];
    }
    if ($combo && $category) {
        $peers = array_filter($clean, fn($r) =>
            $resolveCombo($r) === $combo && ($r['category'] ?? null) === $category
        );
        if (count($peers) >= 5) return ['peers' => array_values($peers), 'scope' => 'combo+category'];
    }
    if ($category && $raceLookup) {
        $peers = array_filter($clean, fn($r) =>
            ($r['category'] ?? null) === $category && ($r['race_lookup'] ?? null) === $raceLookup
        );
        if (count($peers) >= 5) return ['peers' => array_values($peers), 'scope' => 'category+event'];
    }
    if ($category) {
        $peers = array_filter($clean, fn($r) => ($r['category'] ?? null) === $category);
        if (count($peers) >= 3) return ['peers' => array_values($peers), 'scope' => 'category'];
    }

    return ['peers' => [], 'scope' => 'none'];
}

function anomaly_layer3(array $run, array $intervals, array $baselines, array $baselineInfo): array {
    $flags = [];
    if ($baselineInfo['quality'] === 'none') return $flags;

    $soften = function(string $base) use ($baselineInfo): string {
        if ($baselineInfo['quality'] === 'weak') {
            if ($base === 'high') return 'medium';
            if ($base === 'medium') return 'low';
        }
        if ($baselineInfo['quality'] === 'moderate') {
            if ($base === 'high') return 'high';
        }
        return $base;
    };

    foreach (anomaly_timingFields() as $f) {
        $v = $run[$f] ?? null;
        if ($v === null || (float)$v <= 0) continue;
        $v = (float)$v;
        $bl = $baselines[$f] ?? null;
        if (!$bl) continue;

        $z = anomaly_modifiedZScore($v, $bl['median'], $bl['mad']);
        $absZ = abs($z);

        if ($absZ > 5.0) {
            $flags[] = [
                'code' => 'OUTLIER_FIELD', 'severity' => $soften('high'),
                'field' => $f, 'value' => $v, 'zScore' => round($z, 2),
                'expected' => round($bl['lower'], 4) . '–' . round($bl['upper'], 4) . " (median " . round($bl['median'], 4) . ", n={$bl['n']})",
                'explanation' => "$f = $v is a strong outlier (z=" . round($z, 1) . ") vs {$baselineInfo['scope']} peers",
            ];
        } elseif ($absZ > 3.5) {
            $flags[] = [
                'code' => 'OUTLIER_FIELD', 'severity' => $soften('medium'),
                'field' => $f, 'value' => $v, 'zScore' => round($z, 2),
                'expected' => round($bl['lower'], 4) . '–' . round($bl['upper'], 4) . " (median " . round($bl['median'], 4) . ", n={$bl['n']})",
                'explanation' => "$f = $v is an outlier (z=" . round($z, 1) . ") vs {$baselineInfo['scope']} peers",
            ];
        }
    }

    foreach (anomaly_getIntervalSegments($run) as $seg) {
        $v = $intervals[$seg['key']] ?? null;
        if ($v === null || $v <= 0) continue;
        $bl = $baselines[$seg['key']] ?? null;
        if (!$bl) continue;

        $z = anomaly_modifiedZScore($v, $bl['median'], $bl['mad']);
        $absZ = abs($z);

        if ($absZ > 5.0) {
            $flags[] = [
                'code' => 'OUTLIER_INTERVAL', 'severity' => $soften('high'),
                'field' => $seg['key'], 'value' => $v, 'zScore' => round($z, 2),
                'expected' => round($bl['lower'], 4) . '–' . round($bl['upper'], 4) . " (median " . round($bl['median'], 4) . ", n={$bl['n']})",
                'explanation' => "Interval {$seg['label']} = " . round($v, 4) . "s is a strong outlier (z=" . round($z, 1) . ") vs peers",
            ];
        } elseif ($absZ > 3.5) {
            $flags[] = [
                'code' => 'OUTLIER_INTERVAL', 'severity' => $soften('medium'),
                'field' => $seg['key'], 'value' => $v, 'zScore' => round($z, 2),
                'expected' => round($bl['lower'], 4) . '–' . round($bl['upper'], 4) . " (median " . round($bl['median'], 4) . ", n={$bl['n']})",
                'explanation' => "Interval {$seg['label']} = " . round($v, 4) . "s is an outlier (z=" . round($z, 1) . ") vs peers",
            ];
        }
    }

    return $flags;
}

// ── Scoring & narrative ──────────────────────────────────────────────────

function anomaly_computeScore(array $flags): int {
    $score = 100;
    foreach ($flags as $f) {
        $score -= anomaly_severityPenalty($f['severity']);
    }
    return max(0, min(100, $score));
}

function anomaly_computeFieldScores(array $flags): array {
    $fieldMap = [];
    foreach (anomaly_timingFields() as $f) $fieldMap[$f] = [];
    $allSegs = array_merge(anomaly_intervalSegmentsFull(), anomaly_intervalSegmentsNitro());
    $seen = [];
    foreach ($allSegs as $seg) {
        if (!isset($seen[$seg['key']])) { $fieldMap[$seg['key']] = []; $seen[$seg['key']] = true; }
    }

    foreach ($flags as $flag) {
        $field = $flag['field'] ?? null;
        if (!$field) continue;
        $parts = explode('/', $field);
        foreach ($parts as $p) {
            if (!isset($fieldMap[$p])) $fieldMap[$p] = [];
            $fieldMap[$p][] = $flag;
        }
    }

    $results = [];
    foreach ($fieldMap as $field => $fieldFlags) {
        $score = 100;
        foreach ($fieldFlags as $f) {
            $score -= anomaly_severityPenalty($f['severity']);
        }
        $score = max(0, min(100, $score));
        if (!empty($fieldFlags) || $score < 100) {
            $results[] = [
                'field' => $field,
                'score' => $score,
                'band' => anomaly_confidenceBand($score),
                'flagCount' => count($fieldFlags),
            ];
        }
    }
    return $results;
}

// ── Off-Pace / Representative Run Detection ──────────────────────────────

function anomaly_detectOffPace(array $run, array $baselines, array $l1Flags): array {
    $hasHardFails = false;
    foreach ($l1Flags as $f) {
        if ($f['severity'] === 'critical' || $f['severity'] === 'high') { $hasHardFails = true; break; }
    }
    if ($hasHardFails) {
        return ['representative' => true, 'reason' => null, 'excludedFromBaseline' => true, 'exclusionReason' => 'integrity failure'];
    }

    $finish = anomaly_resolveFinish($run);
    $finishET = $finish['effectiveFinishTime'];
    $finishMph = $finish['effectiveFinishMph'];
    $etField = $finish['finishTimeField'];
    $mphField = $finish['finishMphField'];
    $etBl = $baselines[$etField] ?? null;
    $mphBl = $baselines[$mphField] ?? null;

    if (!$etBl && !$mphBl) {
        return ['representative' => true, 'reason' => null, 'excludedFromBaseline' => false, 'exclusionReason' => null];
    }

    $reasons = [];

    if ($finishET !== null && $etBl) {
        $z = anomaly_modifiedZScore($finishET, $etBl['median'], $etBl['mad']);
        $pctSlower = ($finishET - $etBl['median']) / $etBl['median'];
        if ($z > 4.0 && $pctSlower > 0.02) {
            $reasons[] = "Finish ET " . round($finishET, 3) . "s is " . round($z, 1) . "σ slower than peer median " . round($etBl['median'], 3) . "s";
        }
    }

    if ($finishMph !== null && $mphBl) {
        $z = anomaly_modifiedZScore($finishMph, $mphBl['median'], $mphBl['mad']);
        $pctLower = ($mphBl['median'] - $finishMph) / $mphBl['median'];
        if ($z < -4.0 && $pctLower > 0.03) {
            $reasons[] = "Finish MPH " . round($finishMph, 1) . " is " . round(abs($z), 1) . "σ below peer median " . round($mphBl['median'], 1);
        }
    }

    if (!empty($reasons)) {
        return [
            'representative' => false,
            'reason' => implode('; ', $reasons),
            'excludedFromBaseline' => true,
            'exclusionReason' => 'off-pace run — not representative of competitive field',
        ];
    }

    return ['representative' => true, 'reason' => null, 'excludedFromBaseline' => false, 'exclusionReason' => null];
}

// ── Trap-Speed Derived Timestamps ─────────────────────────────────────────

function anomaly_computeTrapDerived(array $run): array {
    $finish = anomaly_resolveFinish($run);
    $g = function($f) use ($run) { return isset($run[$f]) && $run[$f] > 0 ? (float)$run[$f] : null; };
    $mphToFps = function($mph) { return $mph * 5280 / 3600; };
    $flags = [];

    $t_594 = null;
    $delta_594_660 = null;
    $t_finish_minus_66 = null;
    $delta_finishMinus66_finish = null;

    $mph660 = $g('mph660');
    $ft660 = $g('ft660');
    if ($mph660 !== null && $mph660 > 10 && $ft660 !== null) {
        $fps = $mphToFps($mph660);
        $delta_594_660 = round(66 / $fps, 6);
        $t_594 = round($ft660 - $delta_594_660, 6);

        $ft330 = $g('ft330');
        if ($ft330 !== null && $ft660 > $ft330) {
            $t_330_660 = $ft660 - $ft330;
            $ratio = $delta_594_660 / $t_330_660;
            if ($ratio > 0.35) {
                $flags[] = ['segment' => '594→660', 'issue' => "Trap-derived 594→660 (" . round($delta_594_660,4) . "s) is " . round($ratio*100) . "% of the 330→660 interval — mph660 may be implausibly low", 'severity' => 'low'];
            }
        }
    }

    $finishMph = $finish['effectiveFinishMph'];
    $finishET = $finish['effectiveFinishTime'];
    if ($finishMph !== null && $finishMph > 10 && $finishET !== null) {
        $fps = $mphToFps($finishMph);
        $delta_finishMinus66_finish = round(66 / $fps, 6);
        $t_finish_minus_66 = round($finishET - $delta_finishMinus66_finish, 6);

        $ft660v = $g('ft660');
        if ($ft660v !== null && $finishET > $ft660v) {
            $t_660_finish = $finishET - $ft660v;
            $finishDist = $finish['effectiveFinishDistance'];
            $segmentDist = $finishDist - 660;
            $expectedRatio = 66 / $segmentDist;
            $actualRatio = $delta_finishMinus66_finish / $t_660_finish;
            if ($actualRatio > $expectedRatio * 2.5) {
                $flags[] = ['segment' => ($finishDist-66) . '→' . $finishDist, 'issue' => "Trap-derived last-66ft (" . round($delta_finishMinus66_finish,4) . "s) is " . round($actualRatio*100) . "% of 660→finish — finish mph may be implausibly low", 'severity' => 'low'];
            }
        }
    }

    return [
        't_594' => $t_594,
        'delta_594_660' => $delta_594_660,
        't_finish_minus_66' => $t_finish_minus_66,
        'delta_finishMinus66_finish' => $delta_finishMinus66_finish,
        'trapConsistencyFlags' => $flags,
    ];
}

function anomaly_classify(array $flags, string $band, array $baselineInfo): string {
    $hardCodes = ['MISSING_SPLIT_VALUE','NON_MONOTONIC_SPLITS','INVALID_INTERVAL','ZERO_OR_NEGATIVE_TIMING','DUPLICATE_SPLIT_VALUES'];
    $shapeCodes = ['SEGMENT_SHAPE_INCONSISTENT','MPH_ET_INCONSISTENT'];
    $outlierCodes = ['OUTLIER_FIELD','OUTLIER_INTERVAL'];

    $hardFlags = array_filter($flags, fn($f) => in_array($f['code'], $hardCodes));
    $shapeFlags = array_filter($flags, fn($f) => in_array($f['code'], $shapeCodes));
    $outlierFlags = array_filter($flags, fn($f) => in_array($f['code'], $outlierCodes));
    $incomplete = array_filter($flags, fn($f) => $f['code'] === 'INCOMPLETE_RUN_DATA');

    if (!empty($incomplete) && $band === 'Critical') return 'incomplete_record';
    if (!empty($hardFlags)) return 'probable_timing_issue';
    if (!empty($shapeFlags) && count($shapeFlags) >= 1 && $band !== 'High') return 'isolated_suspicious_increment';
    if (!empty($outlierFlags) && empty($hardFlags) && empty($shapeFlags)) return 'unusual_but_plausible';
    if ($band === 'High') return 'clean';
    return 'review_recommended';
}

function anomaly_generateNarrative(array $partial): string {
    $parts = [];
    $classification = $partial['classification'];
    $isCompetitive = $partial['competitiveRun'] ?? false;

    if ($classification === 'clean') {
        $parts[] = 'Run data appears consistent and reliable.';
        if ($isCompetitive) $parts[] = 'Competitive-pace run.';
        if ($partial['flagCount'] > 0) $parts[] = "{$partial['flagCount']} minor note(s) found.";
        return implode(' ', $parts);
    }

    if ($classification === 'incomplete_record') {
        $parts[] = 'Run record is incomplete or corrupt — insufficient timing data for analysis.';
        return implode(' ', $parts);
    }

    $hardCodes = ['MISSING_SPLIT_VALUE','NON_MONOTONIC_SPLITS','INVALID_INTERVAL','ZERO_OR_NEGATIVE_TIMING','DUPLICATE_SPLIT_VALUES'];
    $shapeCodes = ['SEGMENT_SHAPE_INCONSISTENT','MPH_ET_INCONSISTENT'];
    $hardFlags = array_filter($partial['flags'], fn($f) => in_array($f['code'], $hardCodes));
    $shapeFlags = array_filter($partial['flags'], fn($f) => in_array($f['code'], $shapeCodes));

    if ($isCompetitive && (!empty($hardFlags) || !empty($shapeFlags))) {
        $parts[] = '⚠ Competitive-pace run with data concerns — higher priority for review.';
    }

    if ($classification === 'probable_timing_issue') {
        $hardCount = count($hardFlags);
        $parts[] = "$hardCount integrity issue(s) detected: probable timing-data problem.";
    }

    if ($classification === 'isolated_suspicious_increment') {
        $parts[] = 'One or more timing increments appear inconsistent with adjacent segments — possible isolated sensor or recording error.';
    }

    if ($classification === 'unusual_but_plausible') {
        if (!($partial['representativeRun'] ?? true)) {
            $parts[] = 'Run values are unusual compared to peers but may reflect genuine performance rather than a timing error.';
        } else {
            $parts[] = 'Run is unusual but may reflect genuine performance rather than timing error.';
        }
    }

    if ($classification === 'review_recommended') {
        $parts[] = 'Run has multiple minor concerns that warrant review.';
    }

    $suspects = $partial['suspectFields'] ?? [];
    if (count($suspects) === 1) {
        $parts[] = "Issue appears isolated to {$suspects[0]}.";
    } elseif (count($suspects) > 1 && count($suspects) <= 3) {
        $parts[] = "Suspect fields: " . implode(', ', $suspects) . ".";
    }

    $trapFlags = $partial['trapDerived']['trapConsistencyFlags'] ?? [];
    if (!empty($trapFlags)) {
        $issue = explode('—', $trapFlags[0]['issue'])[0];
        $parts[] = "Trap-speed check: " . trim($issue) . ".";
    }

    $bq = $partial['baseline']['quality'] ?? 'none';
    if ($bq === 'weak') {
        $parts[] = 'Historical baseline is weak — outlier conclusions have reduced confidence.';
    } elseif ($bq === 'none') {
        $parts[] = 'No historical baseline available for comparison.';
    }

    return implode(' ', $parts) ?: 'Run analyzed with no specific findings.';
}

// ── Full single-run analysis ─────────────────────────────────────────────

function anomaly_analyzeRun(array $run, array $allRuns, array $cleanIds, int $hardFailCount, array $offPaceIds = [], array $offPaceReasons = [], array $hardFailIds = [], ?float $competitiveMedianET = null): array {
    $intervals = anomaly_computeIntervals($run);
    $finish = anomaly_resolveFinish($run);
    $trapDerived = anomaly_computeTrapDerived($run);
    $l1 = anomaly_layer1($run, $intervals);
    $l2 = anomaly_layer2($run, $intervals);

    $peerResult = anomaly_selectPeers($run, $allRuns, $cleanIds);
    $peers = $peerResult['peers'];
    $scope = $peerResult['scope'];
    $baselines = count($peers) >= 3 ? anomaly_buildBaselines($peers) : [];

    $peerCount = count($peers);
    $quality = $peerCount >= 15 ? 'strong' : ($peerCount >= 5 ? 'moderate' : ($peerCount >= 3 ? 'weak' : 'none'));
    $baselineInfo = [
        'scope' => $scope,
        'sampleSize' => $peerCount,
        'quality' => $quality,
        'hardFailsExcluded' => $hardFailCount,
    ];
    if ($quality === 'weak') {
        $baselineInfo['warning'] = "Only $peerCount clean peer runs available — outlier detection has reduced confidence";
    }

    $l3 = anomaly_layer3($run, $intervals, $baselines, $baselineInfo);

    $runId = (int)$run['id'];
    $offPace = anomaly_detectOffPace($run, $baselines, $l1);
    $isOffPace = isset($offPaceIds[$runId]) || !$offPace['representative'];

    $offPaceFlags = [];
    if ($isOffPace) {
        $offPaceFlags[] = [
            'code' => 'OFF_PACE_RUN', 'severity' => 'info',
            'explanation' => $offPace['reason'] ?? ($offPaceReasons[$runId] ?? 'Run is significantly off the competitive pace'),
        ];
    }

    $qualityFlags = [];
    if ($quality === 'weak' && !empty($l3)) {
        $qualityFlags[] = [
            'code' => 'BASELINE_QUALITY_WEAK', 'severity' => 'info',
            'explanation' => "Historical baseline uses only $peerCount peers ($scope) — outlier conclusions have reduced confidence",
        ];
    }
    if ($quality === 'none') {
        $qualityFlags[] = [
            'code' => 'BASELINE_SAMPLE_TOO_SMALL', 'severity' => 'info',
            'explanation' => 'No suitable peer group found — historical comparison skipped',
        ];
    }

    $allFlags = array_merge($l1, $l2, $l3, $offPaceFlags, $qualityFlags);
    $score = anomaly_computeScore($allFlags);

    if ($isOffPace && !isset($hardFailIds[$runId])) {
        $hasHardInteg = false;
        foreach ($l1 as $f) {
            if ($f['severity'] === 'critical' || $f['severity'] === 'high') { $hasHardInteg = true; break; }
        }
        if (!$hasHardInteg) {
            $score = max($score, 55);
        }
    }

    $band = anomaly_confidenceBand($score);
    $fieldScores = anomaly_computeFieldScores($allFlags);

    $suspectFields = [];
    foreach ($fieldScores as $fs) {
        if ($fs['score'] < 80) $suspectFields[] = $fs['field'];
    }
    usort($suspectFields, function($a, $b) use ($fieldScores) {
        $sa = 100; $sb = 100;
        foreach ($fieldScores as $fs) {
            if ($fs['field'] === $a) $sa = $fs['score'];
            if ($fs['field'] === $b) $sb = $fs['score'];
        }
        return $sa <=> $sb;
    });

    $sorted = $allFlags;
    usort($sorted, fn($a, $b) => anomaly_severityPenalty($b['severity']) <=> anomaly_severityPenalty($a['severity']));
    $primary = !empty($sorted) ? $sorted[0] : null;

    $classification = anomaly_classify($allFlags, $band, $baselineInfo);

    if ($isOffPace && $classification === 'probable_timing_issue') {
        $hasRealInteg = false;
        foreach ($l1 as $f) { if ($f['severity'] === 'critical') { $hasRealInteg = true; break; } }
        if (!$hasRealInteg) $classification = 'unusual_but_plausible';
    }

    $isExcluded = isset($hardFailIds[$runId]) || !isset($cleanIds[$runId]) || $isOffPace;
    $exclusionReason = null;
    if (isset($hardFailIds[$runId])) $exclusionReason = 'integrity failure';
    elseif (!isset($cleanIds[$runId]) && !$isOffPace) $exclusionReason = 'medium-suspect shape flags';
    elseif ($isOffPace) $exclusionReason = $offPace['exclusionReason'] ?? 'off-pace run';

    $isRepresentative = !$isOffPace;
    $competitiveRun = false;
    $competitiveWeight = 0.0;
    if ($isRepresentative && $finish['effectiveFinishTime'] !== null && $competitiveMedianET !== null) {
        $competitiveRun = $finish['effectiveFinishTime'] <= $competitiveMedianET;
        $competitiveWeight = $competitiveRun ? 1.0 : 0.5;
    } elseif ($isRepresentative) {
        $competitiveWeight = 0.5;
    }

    $partial = [
        'runId' => $runId,
        'runUuid' => $run['uuid'] ?? '',
        'overallScore' => $score,
        'band' => $band,
        'classification' => $classification,
        'flagCount' => count($allFlags),
        'suspectFields' => $suspectFields,
        'primaryReasonCode' => $primary ? $primary['code'] : null,
        'primaryReasonText' => $primary ? $primary['explanation'] : 'No issues detected',
        'flags' => $allFlags,
        'fieldScores' => $fieldScores,
        'intervals' => $intervals,
        'trapDerived' => $trapDerived,
        'baseline' => $baselineInfo,
        'finish' => $finish,
        'representativeRun' => $isRepresentative,
        'representativeRunReason' => $isOffPace ? ($offPace['reason'] ?? ($offPaceReasons[$runId] ?? 'Off competitive pace')) : null,
        'excludedFromBaseline' => $isExcluded,
        'baselineExclusionReason' => $exclusionReason,
        'competitiveRun' => $competitiveRun,
        'competitiveWeight' => $competitiveWeight,
    ];

    $partial['narrative'] = anomaly_generateNarrative($partial);

    return $partial;
}

// ── Rollup computation ───────────────────────────────────────────────────

function anomaly_computeRollups(array $runResults, array $runMap): array {
    $byLane = [];
    $byRound = [];
    $byField = [];
    $classifications = ['clean' => 0, 'unusual_but_plausible' => 0, 'isolated_suspicious_increment' => 0,
                        'probable_timing_issue' => 0, 'incomplete_record' => 0, 'review_recommended' => 0];

    foreach ($runResults as $r) {
        $run = $runMap[(int)$r['runId']] ?? null;
        $lane = $run['lane'] ?? 'unknown';
        $round = $run['round'] ?? 'unknown';
        $classification = $r['classification'];

        if (isset($classifications[$classification])) $classifications[$classification]++;

        if (!isset($byLane[$lane])) $byLane[$lane] = ['total' => 0, 'flagged' => 0, 'criticalOrLow' => 0, 'avgScore' => 0, 'scoreSum' => 0];
        $byLane[$lane]['total']++;
        $byLane[$lane]['scoreSum'] += $r['overallScore'];
        if ($r['flagCount'] > 0) $byLane[$lane]['flagged']++;
        if ($r['band'] === 'Critical' || $r['band'] === 'Low') $byLane[$lane]['criticalOrLow']++;

        if (!isset($byRound[$round])) $byRound[$round] = ['total' => 0, 'flagged' => 0, 'criticalOrLow' => 0, 'avgScore' => 0, 'scoreSum' => 0];
        $byRound[$round]['total']++;
        $byRound[$round]['scoreSum'] += $r['overallScore'];
        if ($r['flagCount'] > 0) $byRound[$round]['flagged']++;
        if ($r['band'] === 'Critical' || $r['band'] === 'Low') $byRound[$round]['criticalOrLow']++;

        foreach ($r['suspectFields'] as $f) {
            $byField[$f] = ($byField[$f] ?? 0) + 1;
        }
    }

    foreach ($byLane as &$v) { $v['avgScore'] = $v['total'] > 0 ? round($v['scoreSum'] / $v['total'], 1) : 0; unset($v['scoreSum']); }
    foreach ($byRound as &$v) { $v['avgScore'] = $v['total'] > 0 ? round($v['scoreSum'] / $v['total'], 1) : 0; unset($v['scoreSum']); }
    unset($v);

    arsort($byField);

    return [
        'byLane' => $byLane,
        'byRound' => $byRound,
        'byField' => $byField,
        'classifications' => $classifications,
    ];
}
