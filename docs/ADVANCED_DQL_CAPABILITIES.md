# Advanced DQL and Business Analytics Capabilities

## Overview

Based on the [Dynatrace Business Analytics API documentation](https://docs.dynatrace.com/docs/observe/business-analytics/ba-api-ingest), the TalkO11yToMe tools have been enhanced with advanced DQL (Dynatrace Query Language) capabilities and business events support.

## Enhanced Tools

### 1. `grail-business-analytics.js` (NEW)
A comprehensive business analytics tool with advanced DQL queries and business events ingestion.

**Key Features:**
- **Business Events Ingestion**: Support for JSON, CloudEvents, and CloudEvents batch formats
- **Advanced DQL Queries**: Pre-built analytics for business insights
- **Revenue Analysis**: Payment method breakdown and customer behavior analysis
- **Time Series Analysis**: Revenue trends over time
- **Correlation Analysis**: Business events vs technical events

**Usage Examples:**
```bash
# Run payment analysis
node grail-business-analytics.js analytics paymentAnalysis

# Execute custom DQL query
node grail-business-analytics.js query "fetch bizevents | summarize count() by paymentType"

# Ingest sample business events
node grail-business-analytics.js ingest json
```

### 2. Enhanced `grail-log-query.js`
Updated with business events support and advanced correlation capabilities.

**New Features:**
- **Business Events Querying**: Direct business events searches
- **Log-Business Correlation**: Correlate technical issues with business impact
- **Enhanced OAuth Scopes**: Includes `storage:bizevents:read`
- **Custom DQL Execution**: Run any DQL query directly

**Usage Examples:**
```bash
# Enhanced search across all data sources
node grail-log-query.js search "error" now-2h

# Execute custom DQL query
node grail-log-query.js dql "fetch logs | filter loglevel == 'ERROR' | limit 10"

# Query business events specifically
node grail-log-query.js bizevents "payment" now-24h

# Correlate logs with business events
node grail-log-query.js correlate "timeout" now-1h
```

## Advanced DQL Query Examples

### Business Analytics Queries

#### 1. Business Events Summary
```dql
fetch bizevents
| summarize count(), 
           count_distinct(dt.event.id), 
           avg(total), 
           max(total) by event.type
| sort count desc
```

#### 2. Payment Method Analysis
```dql
fetch bizevents
| filter paymentType exists
| summarize totalRevenue = sum(total),
           transactionCount = count(),
           avgTransactionValue = avg(total) by paymentType
| sort totalRevenue desc
```

#### 3. Customer Behavior Analysis
```dql
fetch bizevents
| filter customer exists
| summarize orderCount = count(),
           totalSpent = sum(total),
           avgOrderValue = avg(total) by toString(customer)
| sort totalSpent desc
| limit 20
```

#### 4. Revenue Time Series
```dql
fetch bizevents
| filter total > 0
| makeTimeseries revenue = sum(total), transactions = count()
| sort timeframe asc
```

### Correlation Queries

#### 5. Error Events vs Business Impact
```dql
fetch bizevents, logs
| join (fetch logs | filter loglevel == "ERROR"), 
       on: timestamp within 5m
| summarize bizEventErrors = count() by event.type
```

#### 6. Service Health vs Business Impact
```dql
fetch bizevents, events
| join (fetch events 
       | filter event.type == "AVAILABILITY_EVENT"), 
       on: timestamp within 10m
| summarize businessImpact = sum(total),
           affectedTransactions = count() by dt.entity.service
```

### Advanced Log Analysis

#### 7. Lambda Function Error Analysis
```dql
fetch logs
| filter dt.entity.aws_lambda_function exists
| filter loglevel == "ERROR"
| summarize errorCount = count(),
           uniqueErrors = count_distinct(content) by dt.entity.aws_lambda_function
| sort errorCount desc
```

#### 8. Service Response Time Analysis
```dql
fetch logs
| filter duration exists
| summarize avgResponseTime = avg(duration),
           p95ResponseTime = percentile(duration, 95),
           requestCount = count() by dt.entity.service
| sort avgResponseTime desc
```

## Business Events API Integration

### Supported Formats

#### 1. Pure JSON Format
```json
{
   "id": "order-123",
   "paymentType": "credit_card",
   "plannedDeliveryDate": "01.01.2024",
   "event.type": "com.ecommerce.order.completed",
   "event.provider": "ecommerce.platform",
   "total": 234.50,
   "customer": {
      "firstName": "John",
      "lastName": "Doe"
   },
   "orderItems": [
      "PROD-001",
      "PROD-002"
   ]
}
```

#### 2. CloudEvents Format
```json
{
  "specversion": "1.0",
  "id": "8d8c6e5d-829d-4629-86fb-23cda5496fa9",
  "source": "ecommerce.platform",
  "type": "com.ecommerce.order.completed",
  "time": "2023-08-07T07:07:13.532Z",
  "data": {
    "paymentId": "110",
    "orderId": "5117",
    "total": 234.50,
    "customer": {
      "firstName": "John",
      "lastName": "Doe"
    }
  }
}
```

### API Endpoints Used

- **Business Events Ingestion**: `/api/v2/bizevents/ingest`
- **DQL Query Execution**: `/platform/storage/query/v1/query:execute`
- **Traditional APIs**: Problems, Events, Entities (for correlation)

## OAuth Scopes Required

```
storage:bizevents:read
storage:bizevents:write
storage:buckets:read
storage:events:write
storage:logs:read
storage:metrics:read
storage:entities:read
environment-api:problems:read
environment-api:entities:read
```

## Configuration

Ensure your `.env.dev` file includes the enhanced OAuth configuration:

```bash
# Dynatrace Environment (Grail format)
DT_ENVIRONMENT=https://abc12345.apps.dynatrace.com

# OAuth Configuration
OAUTH_CLIENT_ID=dt0s02.ABC123...
OAUTH_CLIENT_SECRET=dt0s02.ABC123...XYZ789.your_secret_here
OAUTH_RESOURCE_URN=urn:dtaccount:your-account-uuid
```

## Business Impact Analysis Features

### 1. Real-time Business Metrics
- Revenue tracking by payment method
- Customer behavior analysis
- Transaction volume monitoring
- Error impact on business operations

### 2. Correlation Capabilities
- Technical errors vs business impact
- Service availability vs revenue loss
- Performance issues vs customer experience
- Lambda function errors vs transaction failures

### 3. Time-based Analysis
- Revenue trends over time
- Peak transaction periods
- Error correlation windows
- Business event frequency analysis

## Use Cases

### 1. E-commerce Platform Monitoring
- Track order completion rates
- Monitor payment processing issues
- Analyze customer behavior patterns
- Correlate technical issues with revenue impact

### 2. Financial Services
- Transaction monitoring
- Fraud detection correlation
- Service availability impact
- Regulatory compliance tracking

### 3. SaaS Applications
- User activity analysis
- Feature usage tracking
- Service health vs user experience
- Revenue impact of outages

## Best Practices

### 1. Query Optimization
- Use appropriate time ranges
- Limit result sets for performance
- Leverage indexed fields for filtering
- Use summarization for large datasets

### 2. Business Event Design
- Include relevant business context
- Use consistent event types
- Add timestamp information
- Structure data for analysis

### 3. Correlation Analysis
- Use appropriate time windows for joins
- Consider event ordering
- Account for processing delays
- Validate correlation accuracy

## Future Enhancements

### Planned Features
1. **Real-time Dashboards**: Integration with Dynatrace dashboards
2. **Alert Correlation**: Business impact alerts
3. **Anomaly Detection**: Business metric anomalies
4. **Predictive Analytics**: Revenue forecasting
5. **Custom Metrics**: Business KPI tracking

### Integration Opportunities
1. **Slack Notifications**: Business impact alerts
2. **Webhook Integration**: Real-time event streaming
3. **API Gateway**: Business events ingestion endpoints
4. **CI/CD Integration**: Deployment impact analysis

---

*This documentation reflects the enhanced capabilities based on the Dynatrace Business Analytics API and demonstrates the power of combining technical monitoring with business insights.* 