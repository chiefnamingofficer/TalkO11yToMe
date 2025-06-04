# TalkO11yToMe Test Suite

## 🧪 **Comprehensive Testing Framework**

This test suite validates all 6 Dynatrace tools and shared infrastructure components to ensure everything is working correctly after improvements and updates.

---

## 📁 **Test Suite Structure**

```
tests/
├── test-suite.js          # Main test runner with comprehensive testing
├── test-config.js         # Configuration, utilities, and test data
├── README.md              # This documentation
└── [future test files]    # Additional specialized tests
```

---

## 🚀 **Quick Start**

### **Run All Tests**
```bash
# From project root
node tests/test-suite.js

# Or from tests directory
cd tests
node test-suite.js
```

### **Expected Output**
```
🧪 TalkO11yToMe - Comprehensive Test Suite
Testing all 6 Dynatrace tools + shared infrastructure
================================================================================

📁 Testing File Structure
  ✅ File structure complete (9/9 files)

🔧 Testing Shared Configuration (lib/config.js)
  ✅ Shared configuration loaded successfully

🔐 Testing Authentication Tools
  ✅ OAuth authentication tool working

🆕 Testing Grail Environment Tools
    ✅ Grail log query tool working
    ✅ Grail business analytics tool working

🏛️ Testing Classic Environment Tools
    ✅ Classic log query tool working
    ✅ Classic API client tool working

🌐 Testing Universal Tools
    ✅ Dynatrace monitor tool working

⏱️  Total test time: 7.6 seconds

📊 TEST RESULTS SUMMARY
Total Tests: 8
✅ Passed: 8
❌ Failed: 0
📈 Success Rate: 100.0%

📁 Test results archived:
   🕐 Timestamped: results/TEST_RESULTS_2025-06-04_04-15-32.md
   📋 Latest: TEST_RESULTS_LATEST.md

💡 View all test history: node tests/test-history.js
💡 Browse results folder: ls tests/results/
```

---

## 🧩 **What Gets Tested**

### **1. File Structure Validation**
- Verifies all expected files exist:
  - `lib/config.js` & `lib/demo-dotenv.js`
  - All 6 tools in `tools/` directory
  - Environment configuration file

### **2. Shared Infrastructure**
- **Configuration Loading**: Tests `lib/config.js` and dotenv integration
- **Environment Detection**: Grail vs Classic auto-detection
- **Error Handling**: Standardized error responses

### **3. Authentication**
- **OAuth Token Generation**: Tests `dynatrace-oauth-tool.js`
- **Bearer Token Validation**: Confirms 5-minute token lifecycle
- **Credential Management**: Secure handling and masking

### **4. Grail Environment Tools**
- **grail-log-query.js**: Primary tool for modern Dynatrace platforms
  - OAuth authentication ✅
  - DQL query execution with polling ✅
  - Multi-API search (Problems, Events, Entities) ✅
- **grail-business-analytics.js**: DQL analytics and business events
  - DQL polling implementation ✅
  - Business event analysis ✅

### **5. Classic Environment Tools**
- **classic-log-query.js**: Primary tool for legacy Dynatrace platforms
  - Multi-API integration ✅
  - Enhanced error handling ✅
- **classic-api-client.js**: Comprehensive API client
  - Auto-environment detection ✅
  - OAuth fallback for Grail environments ✅

### **6. Universal Tools**
- **dynatrace-monitor.js**: Visual monitoring dashboard
  - Cross-environment compatibility ✅
  - Status reporting and health checks ✅

---

## 🎯 **Test Scenarios**

### **Quick Smoke Tests**
Fast validation that tools start and respond:
```bash
# Monitor tool quick check
node tools/dynatrace-monitor.js
```

### **Authentication Tests**
Verify OAuth and token handling:
```bash
# OAuth authentication test
node tools/dynatrace-oauth-tool.js auth
```

### **Data Retrieval Tests**
Test actual data access and processing:
```bash
# Problems retrieval
node tools/classic-api-client.js problems 3

# Search functionality
node tools/grail-log-query.js search lambda now-1h
```

---

## 📊 **Success Criteria**

### **Pass Conditions**
- ✅ Exit code 0 (no crashes)
- ✅ No explicit error messages in output
- ✅ Expected output patterns found
- ✅ Authentication tokens generated (where applicable)
- ✅ Data retrieval successful (where applicable)

### **Output Pattern Detection**
The test suite looks for specific patterns indicating success:

**Authentication**: `OAuth`, `token`, `Bearer`, `authentication`
**Data Access**: `problems`, `entities`, `Lambda`, `results`
**Configuration**: `Environment`, `Configuration`, `loaded`
**DQL**: `DQL`, `query`, `logs`, `fetch`

---

## 🔧 **Configuration**

### **Test Timeouts**
- **Short tests** (10s): Quick validation and file checks
- **Standard tests** (30s): Tool execution and basic operations
- **Long tests** (60s): Complex operations like DQL polling

### **Customization**
Edit `tests/test-config.js` to modify:
- Test timeouts and retry settings
- Expected output patterns
- Test scenarios and queries
- Success criteria

---

## 📈 **Interpreting Results**

### **Success Rate Benchmarks**
- **100%**: Perfect - all tools fully operational
- **80-99%**: Excellent - minor issues, production ready
- **60-79%**: Good - some tools may need attention
- **< 60%**: Needs review - significant issues detected

### **Common Issues & Solutions**

#### **OAuth Authentication Failures**
```bash
❌ OAuth Authentication: OAuth test failed
```
**Solution**: Check credentials in `env/.env.dev`
- Verify `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`
- Confirm `OAUTH_RESOURCE_URN` format

#### **Configuration Loading Failures**
```bash
❌ Shared Configuration: Configuration test failed
```
**Solution**: Verify environment files
- Check `env/.env.dev` exists and has proper format
- Test: `node lib/demo-dotenv.js`

#### **Tool Execution Timeouts**
```bash
❌ [Tool Name]: Test timeout
```
**Solution**: Check network connectivity and credentials
- Verify Dynatrace environment URL is accessible
- Confirm API/OAuth credentials are valid

---

## 🔮 **Future Enhancements**

### **Recently Added Features** ✅
- **✅ Test History Tracking**: Timestamped results with comparison tools
- **✅ Performance Trend Analysis**: Track success rates and duration over time
- **✅ Automated Result Archiving**: Prevents accidental overwrites
- **✅ History Management**: Clean old results, view trends, compare runs

### **Planned Test Additions**
- **Performance benchmarking**: Response time tracking across tools
- **Load testing**: Multiple concurrent tool executions
- **Integration testing**: Tool-to-tool data flow validation
- **Regression testing**: Automated before/after comparisons

### **Advanced Features**
- **CI/CD Integration**: GitHub Actions compatibility
- **Enhanced reporting**: JSON/HTML output formats with charts
- **Parallel execution**: Faster test completion with concurrent runs
- **Mock testing**: Offline testing capabilities for development

---

## 🎯 **Usage Recommendations**

### **Development Workflow**
```bash
# Before making changes
node tests/test-suite.js  # Baseline test

# After making changes  
node tests/test-suite.js  # Regression test

# Before committing
node tests/test-suite.js  # Final validation
```

### **Deployment Validation**
```bash
# New environment setup
node tests/test-suite.js  # Environment validation

# After configuration changes
node tests/test-suite.js  # Config verification
```

### **Troubleshooting**
```bash
# Verbose output for debugging
node tests/test-suite.js --verbose

# Individual tool testing
node tools/[specific-tool].js [args]
```

---

## 📊 **Test Results & History**

### **Timestamped Results**
Each test run creates a unique timestamped file that preserves the complete test results:

```bash
tests/
├── results/                               # 📁 Timestamped results subfolder
│   ├── TEST_RESULTS_2025-06-04_04-15-32.md  # Specific test run
│   ├── TEST_RESULTS_2025-06-04_03-42-18.md  # Previous run
│   └── .gitkeep                             # Ensures directory is tracked
├── TEST_RESULTS_LATEST.md                 # Always points to most recent
├── TEST_RESULTS_SUMMARY.md                # Manual baseline (optional)
├── test-suite.js                          # Main test runner
├── test-history.js                        # History management tool
└── README.md                              # This documentation
```

### **View Test History**
```bash
# Show all test runs in a table format
node tests/test-history.js

# Compare recent performance (last 5 runs)
node tests/test-history.js compare

# Compare specific number of runs
node tests/test-history.js compare 3
```

### **Sample History Output**
```
📋 TalkO11yToMe Test History
================================================================================

📊 Found 3 test run(s):

| # | Date & Time              | Duration | Success | Passed | Failed | Status |
|---|--------------------------|----------|---------|--------|--------|--------|
| 1 | 6/4/2025, 4:15:32 AM     | 7.6s     | 100.0%  |      8 |      0 | 🟢 Perfect |
| 2 | 6/4/2025, 3:42:18 AM     | 8.1s     | 100.0%  |      8 |      0 | 🟢 Perfect |
| 3 | 6/4/2025, 2:58:45 AM     | 7.9s     | 87.5%   |      7 |      1 | 🟡 Good |
```

### **Manage Test History**
```bash
# Clean old test files (keep last 10 by default)
node tests/test-history.js clean

# Keep only last 5 test results
node tests/test-history.js clean 5

# Browse all timestamped results
ls tests/results/

# View help for all commands
node tests/test-history.js help
```

---

**🎉 Ready to test?** Run `node tests/test-suite.js` from the project root! 