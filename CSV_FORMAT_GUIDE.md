# CSV Format Guide for WhatsApp Automation

## Supported CSV Format

The application now supports your Google Maps business CSV format with the following columns:

### Column Structure
| Column # | Field Name | Description | Example |
|----------|-----------|-------------|---------|
| 0 | Title | Business name | "Simply - Mediação e Serviços Imobiliários" |
| 1 | Rating | Business rating | "0" or "4.5" |
| 2 | Reviews | Number of reviews | "0" or "123" |
| 3 | Phone | Primary phone number | "+351 912 676 807" |
| 4 | Industry | Business industry/type | "Imobiliária" |
| 5 | Address | Business address | "Calçada do Galvão 6 A" |
| 6 | Website | Business website | "https://www.example.com" |
| 7 | Google Maps Link | Google Maps URL | "https://www.google.com/maps/..." |
| 8 | Email | Business email | "info@business.com" |
| 9 | Additional_phones | Extra phone numbers | "+351 XXX XXX XXX, +351 YYY YYY YYY" |
| 10 | City | Business city | "Lisbon" |

## Message Template Placeholders

When creating message templates, you can use these placeholders:

### Available Placeholders

- `{{business}}` or `{{name}}` - Business name (from Title column)
- `{{city}}` - City name
- `{{address}}` - Full business address
- `{{industry}}` - Business industry/type
- `{{email}}` - Business email
- `{{website}}` - Business website URL
- `{{rating}}` - Business rating
- `{{reviews}}` - Number of reviews
- `{{phone}}` - Primary phone number

### Example Message Templates

**Simple Template:**
```
Hi! I found your business {{business}} in {{city}}. I'd love to discuss how I can help improve your online presence. Are you available for a quick chat?
```

**Detailed Template:**
```
Hello {{business}} team!

I found your {{industry}} business in {{city}} with a {{rating}}-star rating. 

I specialize in helping businesses like yours improve their online presence and attract more customers. Would you be interested in a quick chat about digital marketing strategies?

Looking forward to hearing from you!
```

**Personalized Template with Multiple Fields:**
```
Hi {{business}}!

I came across your {{industry}} business located at {{address}} in {{city}}. 

With {{reviews}} reviews and a {{rating}}-star rating, you're clearly doing something right! I'd love to discuss how we can help you reach even more customers.

Are you available for a brief call this week?
```

## How to Use

1. **Prepare Your CSV:** Make sure your CSV file matches the format above
2. **Upload:** Click "Bulk Upload" tab and select your CSV file
3. **Create Template:** Write your message using the placeholders
4. **Process:** Click "Upload & Process CSV" to start automation

## Phone Number Handling

The system automatically:
- Validates phone numbers
- Handles international formats
- Detects country codes
- Normalizes numbers for WhatsApp

Supported formats:
- `+351 912 676 807` (with country code)
- `912 676 807` (local format)
- `+351912676807` (without spaces)

## Notes

- Only contacts with valid phone numbers will be processed
- Empty fields will be replaced with empty strings in the message
- The system tracks processed contacts to avoid duplicates
- Failed contacts are logged for review
