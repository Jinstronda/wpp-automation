import OpenAI from 'openai';
import { Lead } from './fileUtils.js';

export interface AIMessageConfig {
  agentName?: string;
  companyName?: string;
  estimatedSavings?: string;
  timeSaved?: string;
}

const SYSTEM_PROMPT = `<system_prompt>
<purpose>
Run WhatsApp chats with cold leads across any industry. Start as a client. Ask one question at a time. Surface one clear business pain. Offer one simple AI automation that solves their problem. Close in two messages only. First an authority plus value line that makes savings obvious. Give them a guarantee. Then a separate CTA to schedule a short call that shows the exact flow for their business.
</purpose>
<persona>
Consultative seller with thirty years in the field. Uses Chris Voss methods such as mirroring, labels, and calibrated questions. Writes with an efficiency style. Direct and specific.
</persona>
<style_rules>
Single question opener only.
One question per message after that.
Short messages. Max three short lines.
Plain words. Conversational tone.
Never use an em dash or a dash.
If unsure say you do not know and ask a simple question.
</style_rules>
<ethics>
Speak to business impact such as time, revenue, service quality, reputation.
</ethics>
<variables>
{business_name} - The business name from the CSV data
{industry} - The industry/business type from the CSV data
{city} - The city extracted from address if available
{agent_name} default Joao
{company_name} default Homodeus
{estimated_savings} optional example thousands a month by saving time and not having to have to hire someone
{time_saved} optional example a few hours a day
</variables>
<services_offered>
We Offer
Automated Lead Generation (if their business is B2B)
Automation for Client Support
24/7 instant reply that sounds like you
Automated Marketing or Follow Up Messages to get clients to show up again
Advanced Websites
Easy client onboarding
<opener_rule>
First message must be exactly one short question tailored to the industry.
Gym example Hey do you still offer trial passes
Dentist example Hi are you taking new patients this month
Restaurant example Hi are you taking reservations this week
Salon example Hi do you have openings this week
Home services example Hi do you handle urgent jobs in {city}
Ecommerce example Hi do you answer product questions here
Night club example Hi whats the price for the club?
Pizza restaurant example Hi are you taking orders for delivery tonight
Marketing agency example Hi do you take on new clients this month
Auto repair shop example Hi do you handle urgent repairs today
</opener_rule>
<turn_logic>
This is ONLY for generating the first opener message. The first message must be exactly one short question tailored to the specific industry and business type.
</turn_logic>
<industry_playbooks>
For Night Clubs people will often go to the club one time and not come back again
For restaurants lack of reviews or had to answer all calls
For gyms trial pass conversion and member retention
For dentists new patient acquisition and appointment scheduling
For salons booking availability and client retention
For auto repair shops urgent service requests and trust building
For marketing agencies new client intake and service delivery
Universal pain
missed calls
slow replies on WhatsApp
no shows and late cancels
weak follow up after an inquiry or a visit
few reviews or referrals
ad leads not answered fast
repeat questions in chat
</industry_playbooks>
<success_criteria>
Generate ONLY the first opener message.
Must be exactly one short question tailored to the specific industry.
Use the business type and industry data to customize the question.
Follow the opener_rule examples for similar business types.
</success_criteria>
<output_format>
Output only the first WhatsApp opener message. No headers. No lists. No XML in the final message. Just the opener question.
</output_format>
</system_prompt>`;

export class AIMessageGenerator {
  private openai: OpenAI | null = null;
  private config: AIMessageConfig;

  constructor(config: AIMessageConfig = {}) {
    this.config = {
      agentName: 'Joao',
      companyName: 'Homodeus',
      estimatedSavings: 'thousands a month by saving time and not having to hire someone',
      timeSaved: 'a few hours a day',
      ...config
    };

    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('OPENAI_API_KEY not found in environment variables. AI message generation will be disabled.');
    }
  }

  /**
   * Generate the first opener message for a business using AI
   */
  async generateOpenerMessage(lead: Lead): Promise<string> {
    if (!this.openai) {
      // Fallback to a generic message if OpenAI is not configured
      return this.generateFallbackOpener(lead);
    }

    try {
      // Extract city from address if available
      const city = this.extractCityFromAddress(lead.address);

      let userPrompt: string;
      let systemPromptToUse = SYSTEM_PROMPT;

      // Check if there's a custom prompt variant (for AI prompt mode)
      if (lead.promptVariant) {
        // Custom AI prompt mode - use the user's custom prompt as the instruction
        userPrompt = `${lead.promptVariant}

Business Details:
- Name: ${lead.businessName || lead.name}
- Industry: ${lead.industry || 'general business'}
${city ? `- City: ${city}` : ''}
${lead.address ? `- Address: ${lead.address}` : ''}
${lead.rating ? `- Rating: ${lead.rating}` : ''}
${lead.website ? `- Website: ${lead.website}` : ''}
${lead.email ? `- Email: ${lead.email}` : ''}

Generate a personalized message based on the instruction above and these business details. Keep it conversational and concise.`;

        // Use simpler system prompt for custom mode
        systemPromptToUse = `You are a sales outreach assistant. Generate personalized, conversational messages based on the user's instructions and the business details provided. Keep messages concise (1-3 sentences max). Be direct and natural.`;
      } else {
        // Standard mode - use default industry-specific prompt
        userPrompt = `Generate the first opener message for this business:

Business: ${lead.businessName || lead.name}
Industry: ${lead.industry || 'general business'}
${city ? `City: ${city}` : ''}
${lead.address ? `Address: ${lead.address}` : ''}
${lead.rating ? `Rating: ${lead.rating}` : ''}
${lead.website ? `Website: ${lead.website}` : ''}

You are talking with a ${lead.industry || 'business'} called "${lead.businessName || lead.name}". Generate only the first opener message - one short question tailored to their specific industry type.`;
      }

      // Get model from environment or default to gpt-5-mini
      const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

      const completion = await this.openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPromptToUse },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const generatedMessage = completion.choices[0]?.message?.content?.trim();

      if (!generatedMessage) {
        console.warn('Empty response from OpenAI, using fallback');
        return this.generateFallbackOpener(lead);
      }

      console.log(`Generated AI message for ${lead.businessName}: "${generatedMessage}"`);
      return generatedMessage;

    } catch (error) {
      console.error('Error generating AI message:', error);
      return this.generateFallbackOpener(lead);
    }
  }

  /**
   * Generate a fallback opener message based on industry patterns
   */
  private generateFallbackOpener(lead: Lead): string {
    const industry = (lead.industry || '').toLowerCase();
    const businessName = lead.businessName || lead.name;
    const city = this.extractCityFromAddress(lead.address);

    // Industry-specific openers
    if (industry.includes('gym') || industry.includes('fitness')) {
      return 'Hey do you still offer trial passes';
    }
    if (industry.includes('dentist') || industry.includes('dental')) {
      return 'Hi are you taking new patients this month';
    }
    if (industry.includes('restaurant') || industry.includes('food') || industry.includes('pizza')) {
      return 'Hi are you taking reservations this week';
    }
    if (industry.includes('salon') || industry.includes('hair') || industry.includes('beauty')) {
      return 'Hi do you have openings this week';
    }
    if (industry.includes('auto') || industry.includes('repair') || industry.includes('mechanic')) {
      return city ? `Hi do you handle urgent repairs in ${city}` : 'Hi do you handle urgent repairs today';
    }
    if (industry.includes('marketing') || industry.includes('agency')) {
      return 'Hi do you take on new clients this month';
    }
    if (industry.includes('club') || industry.includes('bar') || industry.includes('nightclub')) {
      return 'Hi whats the price for the club';
    }
    if (industry.includes('hotel') || industry.includes('accommodation')) {
      return 'Hi do you have availability this week';
    }
    if (industry.includes('ecommerce') || industry.includes('online') || industry.includes('shop')) {
      return 'Hi do you answer product questions here';
    }
    if (industry.includes('service') || industry.includes('home')) {
      return city ? `Hi do you handle urgent jobs in ${city}` : 'Hi do you handle urgent jobs';
    }

    // Generic fallback
    return 'Hi are you open for business today';
  }

  /**
   * Extract city from address string
   */
  private extractCityFromAddress(address?: string): string | null {
    if (!address) return null;

    // Simple pattern to extract city from "123 Street, City, State ZIP"
    const match = address.match(/,\s*([^,]+),\s*[A-Z]{2}/);
    return match ? match[1].trim() : null;
  }

  /**
   * Check if AI message generation is available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AIMessageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export a default instance
export const aiMessageGenerator = new AIMessageGenerator();