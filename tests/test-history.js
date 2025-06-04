#!/usr/bin/env node

/**
 * Test History Manager
 * Utility to view and manage timestamped test results
 */

const fs = require('fs');
const path = require('path');

// ANSI colors
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function print(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Get all test result files
 */
function getTestResultFiles() {
    const resultsDir = path.join(__dirname, 'results');
    
    // Ensure results directory exists
    if (!fs.existsSync(resultsDir)) {
        return [];
    }
    
    const files = fs.readdirSync(resultsDir);
    
    const testFiles = files
        .filter(file => file.startsWith('TEST_RESULTS_') && file.endsWith('.md'))
        .filter(file => file.match(/TEST_RESULTS_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md/))
        .sort()
        .reverse(); // Most recent first
        
    return testFiles;
}

/**
 * Parse test result summary from file
 */
function parseTestResult(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Extract key metrics
        const timestampMatch = content.match(/\*\*Timestamp\*\*: (.+)/);
        const durationMatch = content.match(/\*\*Total Test Time\*\*: (.+) seconds/);
        const successRateMatch = content.match(/## 🎉 \*\*OVERALL RESULTS: (.+)% SUCCESS RATE\*\*/);
        const passedMatch = content.match(/✅ \*\*(\d+) Tests Passed\*\*/);
        const failedMatch = content.match(/❌ \*\*(\d+) Tests Failed\*\*/);
        const totalMatch = content.match(/📊 \*\*(\d+) Total Tests\*\*/);
        
        return {
            timestamp: timestampMatch ? timestampMatch[1] : 'Unknown',
            duration: durationMatch ? parseFloat(durationMatch[1]) : 0,
            successRate: successRateMatch ? parseFloat(successRateMatch[1]) : 0,
            passed: passedMatch ? parseInt(passedMatch[1]) : 0,
            failed: failedMatch ? parseInt(failedMatch[1]) : 0,
            total: totalMatch ? parseInt(totalMatch[1]) : 0
        };
    } catch (error) {
        return null;
    }
}

/**
 * Display test history summary
 */
function showHistory() {
    print('\n' + '='.repeat(80), 'cyan');
    print('📋 TalkO11yToMe Test History', 'bold');
    print('='.repeat(80), 'cyan');
    
    const testFiles = getTestResultFiles();
    
    if (testFiles.length === 0) {
        print('📭 No test history found. Run tests first: node tests/test-suite.js', 'yellow');
        print('💡 Results will be saved to: tests/results/', 'blue');
        return;
    }
    
    print(`\n📊 Found ${testFiles.length} test run(s):\n`, 'white');
    
    // Table header
    print('| # | Date & Time              | Duration | Success | Passed | Failed | Status |', 'cyan');
    print('|---|--------------------------|----------|---------|--------|--------|--------|', 'cyan');
    
    testFiles.forEach((file, index) => {
        const filePath = path.join(__dirname, 'results', file);
        const result = parseTestResult(filePath);
        
        if (result) {
            const date = new Date(result.timestamp).toLocaleString();
            const status = result.successRate === 100 ? '🟢 Perfect' : 
                          result.successRate >= 80 ? '🟡 Good' : '🔴 Issues';
            
            const statusColor = result.successRate === 100 ? 'green' :
                               result.successRate >= 80 ? 'yellow' : 'red';
            
            const row = `| ${String(index + 1).padStart(2)} | ${date.padEnd(24)} | ${String(result.duration + 's').padEnd(8)} | ${String(result.successRate + '%').padEnd(7)} | ${String(result.passed).padStart(6)} | ${String(result.failed).padStart(6)} | ${status.padEnd(6)} |`;
            
            print(row, statusColor);
        }
    });
    
    print('\n' + '='.repeat(80), 'cyan');
}

/**
 * Show detailed comparison of recent runs
 */
function showComparison(count = 5) {
    print('\n' + '='.repeat(80), 'cyan');
    print(`📈 Recent Test Performance (Last ${count} runs)`, 'bold');
    print('='.repeat(80), 'cyan');
    
    const testFiles = getTestResultFiles().slice(0, count);
    
    if (testFiles.length === 0) {
        print('📭 No test results available for comparison', 'yellow');
        return;
    }
    
    const results = testFiles.map(file => {
        const filePath = path.join(__dirname, 'results', file);
        return parseTestResult(filePath);
    }).filter(r => r !== null);
    
    if (results.length === 0) {
        print('❌ Could not parse test results', 'red');
        return;
    }
    
    // Calculate trends
    const avgSuccessRate = (results.reduce((sum, r) => sum + r.successRate, 0) / results.length).toFixed(1);
    const avgDuration = (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(1);
    
    print(`\n📊 Performance Summary:`, 'white');
    print(`   Average Success Rate: ${avgSuccessRate}%`, avgSuccessRate >= 90 ? 'green' : 'yellow');
    print(`   Average Duration: ${avgDuration}s`, 'white');
    print(`   Test Runs Analyzed: ${results.length}`, 'white');
    
    // Show trend
    if (results.length >= 2) {
        const latest = results[0];
        const previous = results[1];
        
        const successTrend = latest.successRate - previous.successRate;
        const durationTrend = latest.duration - previous.duration;
        
        print(`\n📈 Trends (Latest vs Previous):`, 'cyan');
        
        if (successTrend > 0) {
            print(`   Success Rate: +${successTrend.toFixed(1)}% (improving)`, 'green');
        } else if (successTrend < 0) {
            print(`   Success Rate: ${successTrend.toFixed(1)}% (declining)`, 'red');
        } else {
            print(`   Success Rate: No change (stable)`, 'white');
        }
        
        if (durationTrend > 0) {
            print(`   Duration: +${durationTrend.toFixed(1)}s (slower)`, 'yellow');
        } else if (durationTrend < 0) {
            print(`   Duration: ${Math.abs(durationTrend).toFixed(1)}s faster (improving)`, 'green');
        } else {
            print(`   Duration: No change (stable)`, 'white');
        }
    }
    
    print('\n' + '='.repeat(80), 'cyan');
}

/**
 * Clean old test files (keep only last N)
 */
function cleanHistory(keepCount = 10) {
    const testFiles = getTestResultFiles();
    
    if (testFiles.length <= keepCount) {
        print(`📋 Only ${testFiles.length} test files found, nothing to clean`, 'white');
        return;
    }
    
    const filesToDelete = testFiles.slice(keepCount);
    
    print(`\n🧹 Cleaning old test results (keeping last ${keepCount})...`, 'yellow');
    
    let deletedCount = 0;
    filesToDelete.forEach(file => {
        try {
            const filePath = path.join(__dirname, 'results', file);
            fs.unlinkSync(filePath);
            deletedCount++;
            print(`   ✅ Deleted: ${file}`, 'green');
        } catch (error) {
            print(`   ❌ Failed to delete: ${file}`, 'red');
        }
    });
    
    print(`\n📊 Cleanup complete: ${deletedCount} files deleted, ${keepCount} files retained`, 'cyan');
}

/**
 * Show usage information
 */
function showUsage() {
    print('\n' + '='.repeat(80), 'cyan');
    print('📖 Test History Manager - Usage', 'bold');
    print('='.repeat(80), 'cyan');
    
    print('\n🚀 Commands:', 'white');
    print('   node tests/test-history.js                    # Show test history', 'cyan');
    print('   node tests/test-history.js history            # Show test history', 'cyan');
    print('   node tests/test-history.js compare [count]    # Compare recent runs (default: 5)', 'cyan');
    print('   node tests/test-history.js clean [keep]       # Clean old results (default: keep 10)', 'cyan');
    print('   node tests/test-history.js help               # Show this help', 'cyan');
    
    print('\n📋 Examples:', 'white');
    print('   node tests/test-history.js compare 3          # Compare last 3 test runs', 'blue');
    print('   node tests/test-history.js clean 5            # Keep only last 5 test results', 'blue');
    
    print('\n💡 Tips:', 'yellow');
    print('   • Run tests regularly to build history: node tests/test-suite.js', 'yellow');
    print('   • Use comparison to track performance trends over time', 'yellow');
    print('   • Clean old results periodically to save disk space', 'yellow');
    
    print('\n' + '='.repeat(80), 'cyan');
}

// Main command handler
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'history';
    
    switch (command) {
        case 'history':
            showHistory();
            break;
            
        case 'compare':
            const compareCount = parseInt(args[1]) || 5;
            showComparison(compareCount);
            break;
            
        case 'clean':
            const keepCount = parseInt(args[1]) || 10;
            cleanHistory(keepCount);
            break;
            
        case 'help':
            showUsage();
            break;
            
        default:
            print(`❌ Unknown command: ${command}`, 'red');
            showUsage();
            process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { getTestResultFiles, parseTestResult, showHistory, showComparison, cleanHistory }; 