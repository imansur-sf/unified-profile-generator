// ============================================================
// app.js — Wizard flow, state, live preview, export
// ============================================================

const TOTAL_STEPS = 7;
let currentStep = 0;
// Start with a complete, presentation-ready B2C story. Industry templates
// remain available whenever the user changes industry or starts a B2B build.
let state = cloneTonyRobbinsStarter();

const B2B_SECTION_DEFAULTS = {
  overviewMetrics: true, overviewDetails: true, overviewSignals: true,
  peopleStakeholders: true, salesProducts: true, salesActions: true,
  successInsights: true, relatedActivity: true
};

const B2C_SECTION_DEFAULTS = {
  affinities: true, preferences: true, events: true,
  membership: true, recommendations: true, activity: true
};

// The profile entity (B2C/B2B) and the viewer's job are separate choices.
// These presets are the first module registry: a persona chooses a focused
// one-screen composition while the user can still toggle individual modules.
const PERSONA_PRESETS = {
  sales: {
    label: 'Sales', objective: 'convert',
    blueprint: 'Prioritizes commercial fit, purchase signals, and the next action that moves an opportunity forward.',
    b2c: { insights: 'Revenue & Propensity Insights', affinities: 'Purchase & Engagement Signals', preferences: 'Buying Preferences', events: 'Recent Commercial Touchpoints', membership: 'Products & Offers', recommendations: 'Einstein Sales Recommendations', activity: 'Sales & Engagement Activity', sections: { affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true } },
    b2b: { insights: 'Sales & Growth Insights', affinities: 'Buying & Expansion Signals', preferences: 'Account Buying Context', events: 'Buying Committee', membership: 'Products & Commercials', recommendations: 'Next Best Sales Actions', activity: 'Commercial Activity', sections: { overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true } }
  },
  service: {
    label: 'Service', objective: 'resolve',
    blueprint: 'Elevates churn risk, support context, product entitlements, and retention-oriented service actions.',
    b2c: { insights: 'Retention & Service Insights', affinities: 'Churn Risk Indicators', preferences: 'Service Preferences', events: 'Case & Service Timeline', membership: 'Entitlements & Coverage', recommendations: 'Einstein Service Recommendations', activity: 'Service & Support Activity', sections: { affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true } },
    b2b: { insights: 'Health & Churn Risk Insights', affinities: 'Account Risk Indicators', preferences: 'Service Coverage', events: 'Support Stakeholders', membership: 'Entitlements & Contracts', recommendations: 'Next Best Service Actions', activity: 'Service & Support Activity', sections: { overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true } }
  },
  marketing: {
    label: 'Marketing', objective: 'engage',
    blueprint: 'Emphasizes journey stage, content and channel signals, and the best next engagement motion.',
    b2c: { insights: 'Marketing Propensity Insights', affinities: 'Content & Channel Affinities', preferences: 'Channel & Consent Preferences', events: 'Journey & Campaign Timeline', membership: 'Program Enrollment', recommendations: 'Next Best Content', activity: 'Journey Engagement Activity', sections: { affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true } },
    b2b: { insights: 'Account Engagement Insights', affinities: 'Content & Intent Signals', preferences: 'Account Channel Preferences', events: 'Campaign & Journey Stakeholders', membership: 'Programs & Subscriptions', recommendations: 'Next Best Marketing Actions', activity: 'Journey & Campaign Activity', sections: { overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true } }
  },
  success: {
    label: 'Customer Success', objective: 'retain',
    blueprint: 'Centers account health, adoption, renewal readiness, and actions that protect and expand value.',
    b2c: { insights: 'Customer Health Insights', affinities: 'Adoption & Health Signals', preferences: 'Success Preferences', events: 'Milestones & Touchpoints', membership: 'Products & Adoption', recommendations: 'Next Best Success Actions', activity: 'Success & Adoption Activity', sections: { affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true } },
    b2b: { insights: 'Customer Health Insights', affinities: 'Adoption & Renewal Signals', preferences: 'Success Plan Details', events: 'Success Stakeholders', membership: 'Products & Adoption', recommendations: 'Next Best Success Actions', activity: 'Success & Adoption Activity', sections: { overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true } }
  },
  custom: {
    label: 'Custom profile', objective: 'engage',
    blueprint: 'Uses the role and decision request you provide to focus the profile on the most useful signals and actions.',
    b2c: { insights: 'Decision-Ready Insights', affinities: 'Behavior & Context Signals', preferences: 'Relevant Preferences', events: 'Recent Touchpoints', membership: 'Programs & Relationships', recommendations: 'Recommended Actions', activity: 'Relevant Activity', sections: { affinities: true, preferences: true, events: true, membership: true, recommendations: true, activity: true } },
    b2b: { insights: 'Account Decision Insights', affinities: 'Account Signals', preferences: 'Account Context', events: 'Key Relationships', membership: 'Products & Agreements', recommendations: 'Recommended Actions', activity: 'Account Activity', sections: { overviewMetrics: true, overviewDetails: true, overviewSignals: true, peopleStakeholders: true, salesProducts: true, salesActions: true, successInsights: true, relatedActivity: true } }
  }
};

function getProfileStrategy(target = state) {
  target.profileStrategy = Object.assign({ lens: 'sales', objective: 'convert', brief: '', customRole: '' }, target.profileStrategy || {});
  if (!PERSONA_PRESETS[target.profileStrategy.lens]) target.profileStrategy.lens = 'sales';
  return target.profileStrategy;
}

function getProfileStrategyLabel(strategy = getProfileStrategy()) {
  const preset = PERSONA_PRESETS[strategy.lens] || PERSONA_PRESETS.sales;
  if (strategy.lens !== 'custom') return preset.label;
  return String(strategy.customRole || '').trim().slice(0, 64) || preset.label;
}

function applyPersonaPreset(target = state) {
  const strategy = getProfileStrategy(target);
  const preset = PERSONA_PRESETS[strategy.lens] || PERSONA_PRESETS.sales;
  const content = target.profileType === 'b2b' ? preset.b2b : preset.b2c;
  target.insights.title = content.insights;
  target.affinities.title = content.affinities;
  target.preferences.title = content.preferences;
  target.events.title = content.events;
  target.membership.title = content.membership;
  target.recommendations.title = content.recommendations;
  target.activity.title = content.activity;
  if (target.profileType === 'b2b') {
    target.b2bSections = Object.assign({}, B2B_SECTION_DEFAULTS, target.b2bSections || {}, content.sections);
  } else {
    target.b2cSections = Object.assign({}, B2C_SECTION_DEFAULTS, target.b2cSections || {}, content.sections);
  }
}

// These are deliberate, fictional starter stories for presenters who choose
// to build manually. Website analysis replaces them with AI-tailored content;
// changing personas swaps the working story without changing the customer or
// account identity in the left rail.
const PERSONA_SAMPLE_LIBRARY = {
  sales: {
    b2c: {
      insights: [['🎯', 'Purchase Propensity', '84% · High'], ['💸', 'Estimated Value', '$1,240'], ['↗', 'Offer Engagement', '3 high-intent actions'], ['◉', 'Decision Readiness', 'Active research'], ['📅', 'Last Commercial Touch', '2 days ago'], ['✦', 'Cross-sell Fit', 'Strong']],
      series: ['Research activity', 'Purchase intent'], groups: [['Commercial interest', [['Premium plan', 84, 78], ['Expert consultation', 72, 69]]], ['Offer signals', [['Pricing page', 76, 81], ['Product comparison', 68, 74]]]],
      preferences: [['Preferred outreach', 'SMS then email'], ['Decision timing', 'Next 30 days'], ['Primary interest', 'Premium experience'], ['Best contact time', 'Weekday evening']], events: [['Product consultation', 'Sep 18, 2026', 'Booked'], ['Offer comparison', 'Sep 12, 2026', 'Viewed']], membership: [['Current plan', 'Core membership'], ['Recommended offer', 'Premium upgrade']],
      recommendations: [['High intent', 'Schedule a tailored product consultation', 'Open play'], ['Offer fit', 'Share the premium value comparison', 'Send offer']], activity: [['↗', 'Pricing page revisited', 'Viewed pricing for the <b>third time</b>', '2 hours ago'], ['🎯', 'Consultation interest', 'Requested product details through chat', '1 day ago'], ['✦', 'Offer engagement', 'Clicked the <b>premium comparison</b>', '2 days ago']], extra: ['Commercial Context', '💼', [['Open opportunity', 'Premium upgrade'], ['Preferred motion', 'Consultative']]]
    },
    b2b: {
      metrics: { revenue: '$1.42M', revenueTrend: '↑ 9% MoM', pipeline: '$510K', usageScore: '76%', usageTrend: '↑ 5% MoM', activeUsers: '346 active users', healthScore: '81%', healthTrend: '↑ 4% MoM', supportCases: '2 open cases', renewalDate: 'Nov 30, 2026', utilization: '79% utilization' },
      insights: [['↗', 'Expansion Propensity', '78% · High'], ['💰', 'Open Pipeline', '$510K'], ['◉', 'Buying Committee', '7 of 9 roles mapped'], ['✦', 'Champion Strength', 'Strong'], ['▦', 'Product Adoption', '76%'], ['⚠', 'Renewal Risk', 'Low']], series: ['Contact research', 'Account intent'], groups: [['Expansion interest', [['Analytics', 82, 77], ['Automation', 71, 74]]], ['Buying motion', [['Pricing review', 76, 81], ['Executive engagement', 68, 73]]]],
      preferences: [['Commercial owner', 'Morgan Lee'], ['Buying motion', 'Expansion with renewal'], ['Budget cycle', 'Q4 planning'], ['Procurement path', 'Standard review']], events: [['Avery Johnson', 'Executive Sponsor', 'VP, Operations'], ['Priya Shah', 'Champion', 'Director, Platform'], ['Jordan Kim', 'Economic Buyer', 'CFO']], membership: [['Core platform', 'Enterprise · 250 seats'], ['Analytics', 'Expansion opportunity'], ['Renewal', 'Nov 30, 2026']], recommendations: [['High intent', 'Align champion on the Analytics expansion case', 'Activate'], ['Pipeline action', 'Schedule executive value review', 'Suggest']], activity: [['↗', 'Pipeline advanced', 'Analytics opportunity moved to <b>solution review</b>', 'Today'], ['◉', 'Champion engaged', 'Reviewed the <b>value realization brief</b>', '2 days ago'], ['✦', 'Executive signal', 'Sponsor joined the expansion workshop', '1 week ago']], extra: ['Commercial Plan', '💼', [['Open pipeline', '$510K'], ['Next milestone', 'Executive value review']]]
    }
  },
  service: {
    b2c: {
      insights: [['⚠', 'Churn Risk', 'Moderate · Needs attention'], ['🎧', 'Open Service Case', '1 active case'], ['💚', 'Customer Sentiment', 'Declining'], ['📅', 'Last Successful Contact', '12 days ago'], ['◉', 'Resolution Confidence', '72%'], ['✦', 'Save Opportunity', 'High']], series: ['Support signals', 'Risk intensity'], groups: [['Risk indicators', [['Repeated issue', 74, 82], ['Low engagement', 67, 76]]], ['Service context', [['Self-service use', 58, 44], ['Knowledge content', 71, 53]]]],
      preferences: [['Preferred support channel', 'Email'], ['Contact preference', 'Detailed updates'], ['Service tier', 'Priority'], ['Best resolution time', 'Weekday morning']], events: [['Case #84721 opened', 'Sep 16, 2026', 'In progress'], ['Support article viewed', 'Sep 14, 2026', 'Troubleshooting guide']], membership: [['Coverage', 'Priority support'], ['Current entitlement', 'Annual service plan']], recommendations: [['Retention action', 'Proactively resolve the active issue', 'Open case'], ['Save play', 'Offer a guided success check-in', 'Apply play']], activity: [['⚠', 'Case reopened', 'Customer reported the issue is <b>not yet resolved</b>', 'Today'], ['🎧', 'Support interaction', 'Shared troubleshooting steps by email', '2 days ago'], ['💬', 'Sentiment signal', 'Survey comment indicates <b>friction</b>', '5 days ago']], extra: ['Service Context', '🎧', [['Case priority', 'High'], ['Recommended owner', 'Retention specialist']]]
    },
    b2b: {
      metrics: { revenue: '$1.28M', revenueTrend: '↓ 3% MoM', pipeline: '$180K', usageScore: '61%', usageTrend: '↓ 12% MoM', activeUsers: '214 active users', healthScore: '63%', healthTrend: '↓ 9% MoM', supportCases: '5 open cases', renewalDate: 'Nov 30, 2026', utilization: '64% utilization' },
      insights: [['⚠', 'Account Churn Risk', 'Elevated'], ['🎧', 'Support Escalations', '2 active'], ['💚', 'Account Health', '63% · At risk'], ['◉', 'Coverage Gap', '3 critical roles'], ['▦', 'Adoption Risk', 'Declining'], ['✦', 'Save Opportunity', 'High']], series: ['Support signals', 'Account risk'], groups: [['Risk indicators', [['Open escalations', 82, 88], ['Usage decline', 75, 84]]], ['Service engagement', [['Knowledge use', 61, 43], ['Case response', 72, 58]]]],
      preferences: [['Support tier', 'Priority'], ['Escalation owner', 'Morgan Lee'], ['Response SLA', '4 business hours'], ['Renewal status', 'At risk']], events: [['Avery Johnson', 'Executive Sponsor', 'VP, Operations'], ['Priya Shah', 'Service Champion', 'Director, Platform'], ['Jordan Kim', 'Escalation Contact', 'VP, Technology']], membership: [['Core platform', 'Enterprise · 250 seats'], ['Support coverage', 'Priority Success'], ['Renewal', 'Nov 30, 2026']], recommendations: [['Retention action', 'Launch an executive escalation review', 'Activate'], ['Service action', 'Resolve the two recurring platform issues', 'Open cases']], activity: [['⚠', 'Escalation created', 'Two high-priority issues are <b>awaiting review</b>', 'Today'], ['📉', 'Usage declined', 'Active users fell <b>12% month over month</b>', '3 days ago'], ['🎧', 'Case trend', 'Three contacts reported the same workflow issue', '1 week ago']], extra: ['Service Recovery Plan', '🛟', [['Critical issue', 'Workflow reliability'], ['Next milestone', 'Executive escalation review']]]
    }
  },
  marketing: {
    b2c: {
      insights: [['✦', 'Journey Stage', 'Consideration'], ['📨', 'Email Engagement', '62% open · 18% click'], ['🎯', 'Conversion Propensity', '76%'], ['◉', 'Content Affinity', 'How-to guides'], ['📅', 'Last Campaign Touch', 'Yesterday'], ['💚', 'Channel Health', 'Strong']], series: ['Content engagement', 'Conversion signal'], groups: [['Content themes', [['Product education', 84, 73], ['Customer stories', 71, 65]]], ['Channel signals', [['Email', 76, 69], ['Web personalization', 68, 61]]]],
      preferences: [['Preferred channel', 'Email + web'], ['Consent status', 'Subscribed'], ['Content format', 'How-to video'], ['Frequency', 'Weekly']], events: [['Education nurture journey', 'Sep 15, 2026', 'Active'], ['Product webinar', 'Sep 10, 2026', 'Registered']], membership: [['Current journey', 'Education nurture'], ['Campaign eligibility', 'Product launch']], recommendations: [['Next best content', 'Send the advanced product guide', 'Send content'], ['Journey action', 'Personalize the next website visit', 'Activate']], activity: [['📨', 'Email clicked', 'Clicked <b>advanced product guide</b>', 'Today'], ['🌐', 'Website return', 'Returned to the product comparison page', '1 day ago'], ['▶', 'Video completed', 'Watched 82% of the onboarding video', '3 days ago']], extra: ['Journey Context', '🧭', [['Current stage', 'Consideration'], ['Next milestone', 'Webinar attendance']]]
    },
    b2b: {
      metrics: { revenue: '$1.28M', revenueTrend: '↑ 4% MoM', pipeline: '$350K', usageScore: '73%', usageTrend: '↑ 8% MoM', activeUsers: '328 active users', healthScore: '80%', healthTrend: '↑ 3% MoM', supportCases: '2 open cases', renewalDate: 'Nov 30, 2026', utilization: '78% utilization' },
      insights: [['✦', 'Account Intent', 'High'], ['📨', 'Campaign Engagement', '18 engaged contacts'], ['🎯', 'Marketing Qualified', 'Ready for sales'], ['◉', 'Buying Group Reach', '6 roles engaged'], ['▦', 'Content Resonance', 'Product education'], ['💚', 'Channel Health', 'Strong']], series: ['Contact engagement', 'Account intent'], groups: [['Content themes', [['Product education', 83, 76], ['Customer proof', 72, 68]]], ['Journey signals', [['Webinar interest', 75, 81], ['Website return', 68, 73]]]],
      preferences: [['Preferred channel', 'Email + webinar'], ['Consent coverage', '18 marketable contacts'], ['Journey stage', 'Solution education'], ['Campaign owner', 'Morgan Lee']], events: [['Avery Johnson', 'Executive Sponsor', 'VP, Operations'], ['Priya Shah', 'Marketing Champion', 'Director, Platform'], ['Jordan Kim', 'Economic Buyer', 'CFO']], membership: [['Core platform', 'Enterprise · 250 seats'], ['Program', 'Executive nurture'], ['Subscription', 'Product education']], recommendations: [['Next best content', 'Invite the buying group to the value webinar', 'Activate'], ['Journey action', 'Launch account-personalized nurture', 'Suggest']], activity: [['📨', 'Campaign engaged', 'Six contacts clicked the <b>value webinar</b> invitation', 'Today'], ['🌐', 'Account research', 'Buying group returned to solution pages', '2 days ago'], ['▶', 'Content completed', 'Champion watched the adoption story video', '5 days ago']], extra: ['Campaign Context', '📣', [['Active program', 'Executive nurture'], ['Next milestone', 'Value webinar']]]
    }
  },
  success: {
    b2c: {
      insights: [['💚', 'Customer Health', '78% · Healthy'], ['▦', 'Product Adoption', '72%'], ['📅', 'Renewal Readiness', 'On track'], ['🎯', 'Expansion Fit', 'Moderate'], ['◉', 'Milestone Progress', '4 of 5 complete'], ['✦', 'Advocacy Potential', 'High']], series: ['Adoption signal', 'Health contribution'], groups: [['Adoption areas', [['Core workflow', 78, 74], ['Advanced feature', 61, 58]]], ['Success signals', [['Milestone completion', 83, 77], ['Value realization', 72, 69]]]],
      preferences: [['Success channel', 'Video check-in'], ['Primary goal', 'Advance proficiency'], ['Check-in cadence', 'Monthly'], ['Learning format', 'Guided workshop']], events: [['Success milestone', 'Sep 17, 2026', 'Completed'], ['Value review', 'Sep 5, 2026', 'Scheduled']], membership: [['Current plan', 'Premium membership'], ['Adoption program', 'Guided success']], recommendations: [['Success action', 'Celebrate the completed milestone', 'Send note'], ['Adoption action', 'Recommend the advanced-feature workshop', 'Activate']], activity: [['🏁', 'Milestone completed', 'Finished the <b>core workflow</b> milestone', 'Today'], ['▦', 'Adoption increased', 'Used advanced features in three sessions', '3 days ago'], ['💚', 'Health improved', 'Customer health improved <b>6 points</b>', '1 week ago']], extra: ['Success Context', '🌱', [['Primary goal', 'Advance proficiency'], ['Next milestone', 'Advanced workflow workshop']]]
    },
    b2b: {
      metrics: { revenue: '$1.28M', revenueTrend: '↑ 6% MoM', pipeline: '$290K', usageScore: '82%', usageTrend: '↑ 10% MoM', activeUsers: '386 active users', healthScore: '86%', healthTrend: '↑ 7% MoM', supportCases: '1 open case', renewalDate: 'Nov 30, 2026', utilization: '84% utilization' },
      insights: [['💚', 'Account Health', '86% · Healthy'], ['▦', 'Product Adoption', '82%'], ['📅', 'Renewal Readiness', 'On track'], ['◉', 'Stakeholder Coverage', '9 of 10 roles mapped'], ['🎯', 'Expansion Fit', '71%'], ['✦', 'Advocacy Potential', 'High']], series: ['Adoption signals', 'Health contribution'], groups: [['Adoption areas', [['Core platform', 85, 81], ['Analytics feature', 68, 64]]], ['Value signals', [['Milestone completion', 82, 78], ['Executive engagement', 76, 73]]]],
      preferences: [['Success owner', 'Morgan Lee'], ['Success plan', 'Scale adoption'], ['Review cadence', 'Quarterly'], ['Renewal posture', 'On track']], events: [['Avery Johnson', 'Executive Sponsor', 'VP, Operations'], ['Priya Shah', 'Success Champion', 'Director, Platform'], ['Jordan Kim', 'Economic Buyer', 'CFO']], membership: [['Core platform', 'Enterprise · 250 seats'], ['Success program', 'Scale adoption'], ['Renewal', 'Nov 30, 2026']], recommendations: [['Success action', 'Run a QBR focused on realized value', 'Activate'], ['Adoption action', 'Expand the advanced-feature cohort', 'Suggest']], activity: [['🏁', 'Milestone completed', 'Two teams completed the advanced workflow', 'Today'], ['▦', 'Adoption increased', 'Active usage grew <b>10% month over month</b>', '3 days ago'], ['💚', 'Health improved', 'Account health improved <b>7 points</b>', '1 week ago']], extra: ['Success Plan', '🌱', [['Primary goal', 'Scale adoption'], ['Next milestone', 'Quarterly value review']]]
    }
  },
  custom: {
    b2c: {
      insights: [['✦', 'Decision Priority', 'Needs review'], ['◉', 'Relevant Signal', 'High confidence'], ['🎯', 'Action Readiness', 'Ready'], ['📅', 'Recent Change', '2 days ago'], ['💚', 'Experience Signal', 'Positive'], ['▦', 'Context Coverage', 'Strong']], series: ['Observed behavior', 'Decision signal'], groups: [['Decision context', [['High-value behavior', 78, 74], ['Recent change', 71, 69]]], ['Supporting evidence', [['Engagement signal', 75, 72], ['Program activity', 63, 61]]]],
      preferences: [['Preferred channel', 'Email'], ['Decision cadence', 'Weekly'], ['Primary context', 'Current program'], ['Best contact time', 'Weekday morning']], events: [['Relevant milestone', 'Sep 16, 2026', 'Completed'], ['Recent interaction', 'Sep 13, 2026', 'Engaged']], membership: [['Current program', 'Core experience'], ['Relevant status', 'Active']], recommendations: [['Recommended action', 'Review the highest-priority signal', 'Open view'], ['Suggested follow-up', 'Send a contextual next step', 'Activate']], activity: [['✦', 'Priority signal detected', 'A high-value behavior requires review', 'Today'], ['◉', 'Context updated', 'New supporting evidence was added', '2 days ago'], ['📨', 'Engagement recorded', 'Responded to a recent communication', '4 days ago']], extra: ['Decision Context', '✦', [['Primary signal', 'High-value behavior'], ['Next step', 'Review and act']]]
    },
    b2b: {
      metrics: { revenue: '$1.28M', revenueTrend: 'Stable', pipeline: '$300K', usageScore: '74%', usageTrend: 'Stable', activeUsers: '328 active users', healthScore: '80%', healthTrend: 'Stable', supportCases: '2 open cases', renewalDate: 'Nov 30, 2026', utilization: '78% utilization' },
      insights: [['✦', 'Decision Priority', 'Needs review'], ['◉', 'Signal Confidence', 'High'], ['🎯', 'Action Readiness', 'Ready'], ['▦', 'Context Coverage', 'Strong'], ['💚', 'Account Health', '80%'], ['📅', 'Recent Change', '2 days ago']], series: ['Contact signals', 'Account signals'], groups: [['Decision context', [['High-value behavior', 78, 74], ['Recent change', 71, 69]]], ['Supporting evidence', [['Stakeholder activity', 75, 72], ['Program activity', 63, 61]]]],
      preferences: [['Profile owner', 'Morgan Lee'], ['Decision cadence', 'Weekly'], ['Account context', 'Current program'], ['Review status', 'Active']], events: [['Avery Johnson', 'Executive Sponsor', 'VP, Operations'], ['Priya Shah', 'Primary Contact', 'Director, Platform'], ['Jordan Kim', 'Decision Partner', 'CFO']], membership: [['Core platform', 'Enterprise · 250 seats'], ['Relevant program', 'Active'], ['Renewal', 'Nov 30, 2026']], recommendations: [['Recommended action', 'Review the highest-priority account signal', 'Open view'], ['Suggested follow-up', 'Schedule a contextual account review', 'Activate']], activity: [['✦', 'Priority signal detected', 'A high-value account behavior requires review', 'Today'], ['◉', 'Context updated', 'New stakeholder evidence was added', '2 days ago'], ['📨', 'Engagement recorded', 'Account responded to recent communication', '4 days ago']], extra: ['Decision Context', '✦', [['Primary signal', 'High-value account behavior'], ['Next step', 'Review and act']]]
    }
  }
};

// Supporting cards complete the first screen for every persona without
// forcing an AI-created card to push the page below the fold. A card marked
// "suggested" stays available in the builder, but is not rendered until the
// user promotes it into a column.
const PERSONA_SUPPORTING_MODULES = {
  sales: {
    visible: [
      { title: 'Business Profile (Vance Tech)', icon: '💼', items: [['Industry Vertical', 'SaaS / Tech Services'], ['Annual Growth Rate', '35% YoY'], ['Marketing Budget', '$150,000 / year'], ['Sales Model', 'B2B Enterprise']] }
    ],
    suggested: [
      { title: 'Sales Qualification Notes', icon: '📝', items: [['Authority', 'Sole Founder & Decision Maker'], ['Timeline', 'Q1 Upgrade Goal'], ['Key Motivator', 'Peer networking with high-growth founders']] }
    ]
  },
  service: {
    visible: [
      { title: 'Service Context', icon: '🎧', items: [['Case priority', 'High'], ['Recommended owner', 'Retention specialist'], ['Preferred resolution', 'Guided walkthrough']] },
      { title: 'Retention Plan', icon: '🛟', items: [['Save motion', 'Executive check-in'], ['Risk driver', 'Repeated workflow issue'], ['Next milestone', 'Resolved-case confirmation']] }
    ],
    suggested: [
      { title: 'Voice of Customer', icon: '💬', items: [['Sentiment trend', 'Declining'], ['Survey follow-up', 'Requested'], ['Top theme', 'Faster resolution']] }
    ]
  },
  marketing: {
    visible: [
      { title: 'Journey Context', icon: '🧭', items: [['Current stage', 'Consideration'], ['Next milestone', 'Webinar attendance'], ['Journey owner', 'Growth marketing']] },
      { title: 'Content Performance', icon: '📣', items: [['Top content', 'Advanced product guide'], ['Campaign response', '18% click rate'], ['Audience fit', 'High intent segment']] }
    ],
    suggested: [
      { title: 'Audience Activation', icon: '✨', items: [['Eligible channel', 'Email + web'], ['Next audience', 'Product explorers'], ['Suppression status', 'None']] }
    ]
  },
  success: {
    visible: [
      { title: 'Success Context', icon: '🌱', items: [['Primary goal', 'Advance proficiency'], ['Next milestone', 'Advanced workflow workshop'], ['Success owner', 'Customer success team']] },
      { title: 'Value Realization', icon: '📈', items: [['Value signal', 'Core workflow adoption'], ['Expansion cue', 'Advanced feature interest'], ['Renewal confidence', 'On track']] }
    ],
    suggested: [
      { title: 'Success Plan', icon: '🗺️', items: [['Executive sponsor', 'Engaged'], ['Plan status', 'On track'], ['Next review', 'Monthly value check-in']] }
    ]
  },
  custom: {
    visible: [
      { title: 'Decision Context', icon: '✦', items: [['Primary signal', 'High-value behavior'], ['Next step', 'Review and act'], ['Decision owner', 'Profile viewer']] },
      { title: 'Action Plan', icon: '✅', items: [['Recommended motion', 'Contextual follow-up'], ['Confidence', 'High'], ['Timing', 'This week']] }
    ],
    suggested: [
      { title: 'Supporting Evidence', icon: '◉', items: [['Evidence source', 'Engagement + program data'], ['Signal freshness', '2 days ago'], ['Coverage', 'Strong']] }
    ]
  }
};

const PERSONA_ACTIVITY_BOOSTS = {
  sales: [['📨', 'Opened leadership playbook', 'Opened the <b>growth playbook</b> after a commercial touchpoint', '4 days ago'], ['🤝', 'Advisor follow-up booked', 'Scheduled a focused <b>value review</b> with an advisor', '1 week ago']],
  service: [['📚', 'Knowledge article viewed', 'Reviewed the troubleshooting guide before reopening the case', '7 days ago'], ['📞', 'Service follow-up scheduled', 'Accepted a proactive resolution check-in', '9 days ago']],
  marketing: [['🎯', 'Audience qualification updated', 'Moved into the <b>high-intent</b> nurture audience', '5 days ago'], ['🧩', 'Personalized web content served', 'Viewed a tailored proof-point experience', '8 days ago']],
  success: [['📈', 'Value milestone tracked', 'Logged progress against the <b>advanced workflow</b> milestone', '5 days ago'], ['🤝', 'Success review confirmed', 'Accepted the next value realization check-in', '9 days ago']],
  custom: [['🧠', 'Context signal refreshed', 'New supporting behavior was added to the decision view', '5 days ago'], ['✅', 'Recommended action queued', 'A contextual next step is ready for review', '8 days ago']]
};

function itemsFromPairs(items, keys) {
  return items.map(values => Object.fromEntries(keys.map((key, index) => [key, values[index]])));
}

function createSupportingCard(definition, placement = 'middle', visibility = 'visible') {
  return {
    moduleId: `module-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: definition.title,
    icon: definition.icon,
    items: itemsFromPairs(definition.items, ['label', 'value']),
    placement,
    visibility
  };
}

function normalizeCustomModules(target = state) {
  ['extraCards', 'rightExtraCards'].forEach((key) => {
    if (!Array.isArray(target[key])) target[key] = [];
    const defaultPlacement = key === 'rightExtraCards' ? 'right' : 'middle';
    target[key].forEach((card, index) => {
      if (!card.moduleId) card.moduleId = `${defaultPlacement}-module-${index + 1}`;
      if (!['middle', 'right'].includes(card.placement)) card.placement = defaultPlacement;
      if (!['visible', 'suggested', 'hidden'].includes(card.visibility)) card.visibility = 'visible';
      if (!Array.isArray(card.items)) card.items = [];
    });
  });
}

function getCustomModules(target = state) {
  normalizeCustomModules(target);
  return [...target.extraCards, ...target.rightExtraCards];
}

function buildPersonaSupportingModules(lens) {
  const registry = PERSONA_SUPPORTING_MODULES[lens] || PERSONA_SUPPORTING_MODULES.sales;
  return [
    ...registry.visible.map(card => createSupportingCard(card, 'middle', 'visible')),
    ...registry.suggested.map(card => createSupportingCard(card, 'middle', 'suggested'))
  ];
}

function applyPersonaSampleTemplate(target = state) {
  const strategy = getProfileStrategy(target);
  const mode = target.profileType === 'b2b' ? 'b2b' : 'b2c';
  const template = PERSONA_SAMPLE_LIBRARY[strategy.lens]?.[mode];
  if (!template) return;
  // Preserve the curated Tony Robbins sales story on first launch. It is the
  // richer out-of-the-box example users can edit without analyzing a website.
  if (target._starterProfile === 'tony-robbins' && mode === 'b2c' && strategy.lens === 'sales') {
    target.extraCards = buildPersonaSupportingModules('sales');
    target.rightExtraCards = [];
    normalizeCustomModules(target);
    return;
  }
  const primary = target.colors?.primary || '#001E5B';
  const accent = target.colors?.accent || '#066AFE';
  // The Salesforce chrome intentionally defaults to a white accent. Keep the
  // modeled signal series visible on its white cards until a user edits it.
  const signalAccent = /^#(?:fff|ffffff)$/i.test(accent) ? '#066AFE' : accent;
  target.insights.items = itemsFromPairs(template.insights, ['icon', 'label', 'value']);
  target.affinities.seriesA = { label: template.series[0], color: primary };
  target.affinities.seriesB = { label: template.series[1], color: signalAccent };
  target.affinities.groups = template.groups.map(([name, items]) => ({ name, items: itemsFromPairs(items, ['label', 'a', 'b']) }));
  target.preferences.items = itemsFromPairs(template.preferences, ['label', 'value']);
  target.events.items = itemsFromPairs(template.events, ['name', 'date', 'confirmation']);
  target.membership.items = itemsFromPairs(template.membership, ['label', 'value']);
  const oldRecommendations = target.recommendations.items || [];
  target.recommendations.items = template.recommendations.map((item, index) => ({ eyebrow: item[0], title: item[1], cta: item[2], image: oldRecommendations[index]?.image || '' }));
  const activityItems = [...template.activity, ...(PERSONA_ACTIVITY_BOOSTS[strategy.lens] || [])];
  target.activity.items = itemsFromPairs(activityItems, ['icon', 'title', 'body', 'time']);
  if (mode === 'b2c') {
    target.extraCards = buildPersonaSupportingModules(strategy.lens);
    target.rightExtraCards = [];
  } else {
    target.extraCards = [{ ...createSupportingCard({ title: template.extra[0], icon: template.extra[1], items: template.extra[2] }, 'middle', 'visible') }];
    target.rightExtraCards = [];
  }
  normalizeCustomModules(target);
  if (mode === 'b2b') target.accountMetrics = Object.assign({}, target.accountMetrics || {}, template.metrics);
}

const PERSONA_VIEW_FIELDS = [
  'insights', 'affinities', 'preferences', 'events', 'membership',
  'recommendations', 'activity', 'extraCards', 'rightExtraCards',
  'b2cSections', 'b2bSections'
];

function cloneViewData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// Brand identity and the unified customer/account remain shared. Everything
// that describes how a particular team consumes that information is retained
// as its own editable working view.
function snapshotPersonaView(target = state, lens = getProfileStrategy(target).lens) {
  if (!PERSONA_PRESETS[lens]) return;
  if (!target.personaVariants || typeof target.personaVariants !== 'object') target.personaVariants = {};
  const variant = {
    strategy: Object.assign({}, getProfileStrategy(target), { lens })
  };
  PERSONA_VIEW_FIELDS.forEach(key => { variant[key] = cloneViewData(target[key]); });
  target.personaVariants[lens] = variant;
}

function restorePersonaView(target = state, lens) {
  const currentStrategy = getProfileStrategy(target);
  const saved = target.personaVariants?.[lens];
  if (saved) {
    PERSONA_VIEW_FIELDS.forEach(key => {
      if (saved[key] !== undefined) target[key] = cloneViewData(saved[key]);
    });
    target.profileStrategy = Object.assign(
      { lens, objective: PERSONA_PRESETS[lens].objective, brief: '', customRole: '' },
      cloneViewData(saved.strategy) || {},
      { lens }
    );
    return true;
  }

  target.profileStrategy = {
    lens,
    objective: PERSONA_PRESETS[lens].objective,
    // Keep broadly useful scenario context when this is the first view, but
    // give each persona its own objective and later-editable brief.
    brief: currentStrategy.brief || '',
    customRole: lens === 'custom' ? '' : currentStrategy.customRole || ''
  };
  applyPersonaPreset(target);
  applyPersonaSampleTemplate(target);
  return false;
}

function updateProfileStrategyUI() {
  const strategy = getProfileStrategy();
  const preset = PERSONA_PRESETS[strategy.lens] || PERSONA_PRESETS.sales;
  Object.keys(PERSONA_PRESETS).forEach(lens => {
    const button = document.getElementById(`persona-${lens}`);
    if (button) { button.classList.toggle('active', strategy.lens === lens); button.setAttribute('aria-checked', String(strategy.lens === lens)); }
  });
  const objective = document.getElementById('strategy-objective');
  const brief = document.getElementById('strategy-brief');
  const customRole = document.getElementById('strategy-custom-role');
  const customRoleField = document.getElementById('custom-role-field');
  if (objective) objective.value = strategy.objective;
  if (brief) brief.value = strategy.brief;
  if (customRole) customRole.value = strategy.customRole || '';
  if (customRoleField) customRoleField.hidden = strategy.lens !== 'custom';
  const blueprint = document.getElementById('strategy-blueprint');
  if (blueprint) {
    const profileLabel = getProfileStrategyLabel(strategy);
    const customReminder = strategy.lens === 'custom' && !String(strategy.customRole || '').trim()
      ? '<br><em>Add the profile role above to tailor the generated view.</em>' : '';
    blueprint.innerHTML = `<span>✦</span><span><strong>${escHTML(profileLabel)} view · ${strategy.objective}</strong><br>${preset.blueprint}${customReminder}<br><em>This view saves its own module choices and brief.</em></span>`;
  }

  // Keep the seven-step editor oriented around the selected team’s decision,
  // rather than making people translate generic module names as they work.
  const content = isB2B() ? preset.b2b : preset.b2c;
  const entity = isB2B() ? 'account' : 'customer';
  const profileLabel = getProfileStrategyLabel(strategy);
  setText('step-3-title', `${profileLabel} ${isB2B() ? 'Account' : ''} Insights`.trim());
  setText('step-3-sub', `Configure the modeled ${entity} signals and calculated insights that help ${profileLabel.toLowerCase()} achieve the ${strategy.objective} objective.`);
  setText('step-3-insights-heading', content.insights);
  setText('step-4-title', content.affinities);
  setText('step-4-sub', `Tune the aggregate signals and evidence ${profileLabel.toLowerCase()} should use to make the next decision.`);
  setText('step-5-title', `${content.preferences}, ${content.events} & ${content.membership}`);
  setText('step-5-sub', `Edit the context, relationships, and programs that make this ${entity} story actionable.`);
  setText('step-5-preferences-heading', content.preferences);
  setText('step-5-events-heading', content.events);
  setText('step-5-membership-heading', content.membership);
  setText('step-6-title', `${content.recommendations} & ${content.activity}`);
  setText('step-6-sub', `Prioritize concise next-best actions and the activity evidence ${profileLabel.toLowerCase()} needs to act with confidence.`);
  setText('step-6-recs-heading', content.recommendations);
  setText('step-6-activity-heading', content.activity);
  renderPersonaOutputSwitcher(strategy);
}

// Step 7 is a delivery surface, so it mirrors the persona picker without
// making people return to Quick Start or lose the independently saved view.
function renderPersonaOutputSwitcher(strategy = getProfileStrategy()) {
  const container = document.getElementById('persona-output-switcher');
  if (!container) return;
  const label = getProfileStrategyLabel(strategy);
  setText('persona-output-summary', `${label} is selected. Present, download, or copy this saved persona view.`);
  container.innerHTML = Object.entries(PERSONA_PRESETS).map(([lens, preset]) => {
    const active = strategy.lens === lens;
    const name = lens === 'custom' && strategy.customRole ? strategy.customRole : preset.label;
    return `<button type="button" class="${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-700'} border rounded-lg px-3 py-2 text-xs font-700 transition" onclick="setPersonaOutputLens('${lens}')" aria-pressed="${active}">${escHTML(name)}</button>`;
  }).join('');
}

function setPersonaOutputLens(lens) {
  setViewerLens(lens);
  if (currentStep !== TOTAL_STEPS - 1) goToStep(TOTAL_STEPS - 1);
}

function setViewerLens(lens) {
  if (!PERSONA_PRESETS[lens]) return;
  readStaticFields();
  const currentLens = getProfileStrategy().lens;
  snapshotPersonaView(state, currentLens);
  restorePersonaView(state, lens);
  fillStaticFields();
  renderAll();
  refreshPreview();
  if (currentStep === 0 && lens === 'custom' && !getProfileStrategy().customRole) document.getElementById('strategy-custom-role')?.focus();
}

function onProfileStrategyChange() {
  const strategy = getProfileStrategy();
  strategy.objective = document.getElementById('strategy-objective')?.value || strategy.objective;
  strategy.brief = document.getElementById('strategy-brief')?.value || '';
  strategy.customRole = document.getElementById('strategy-custom-role')?.value.trim() || '';
  updateProfileStrategyUI();
  refreshPreview();
}

function getB2CSections() {
  state.b2cSections = Object.assign({}, B2C_SECTION_DEFAULTS, state.b2cSections || {});
  return state.b2cSections;
}

function getB2BSections() {
  state.b2bSections = Object.assign({}, B2B_SECTION_DEFAULTS, state.b2bSections || {});
  return state.b2bSections;
}

function isB2B() { return state.profileType === 'b2b'; }

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateProfileModeUI() {
  const b2b = isB2B();
  document.body.classList.toggle('profile-mode-b2b', b2b);
  const b2cButton = document.getElementById('profile-type-b2c');
  const b2bButton = document.getElementById('profile-type-b2b');
  if (b2cButton) { b2cButton.classList.toggle('active', !b2b); b2cButton.setAttribute('aria-checked', String(!b2b)); }
  if (b2bButton) { b2bButton.classList.toggle('active', b2b); b2bButton.setAttribute('aria-checked', String(b2b)); }

  setText('quickstart-title', b2b ? 'Analyze customer URL for an account profile' : 'Analyze customer URL with AI');
  setText('quickstart-sub', b2b
    ? 'Paste the customer’s homepage — AI extracts brand context and images, then creates a plausible account-level Unified Profile with commercial, usage, and health signals.'
    : 'Paste the customer’s homepage — AI extracts brand identity, colors, and pre-fills a unified profile that matches their industry. You can still edit anything after.');
  setText('step-2-title', b2b ? 'Account Profile' : 'Profile Card');
  setText('step-2-sub', b2b ? 'Firmographics, ownership, hierarchy, and account identity shown in the left rail.' : 'The customer’s demographic, contact, and segment membership shown in the left panel.');
  setText('step-3-title', b2b ? 'Account Metrics & Insights' : 'Insights');
  setText('step-3-sub', b2b ? 'Configure commercial, product-usage, and customer-health scorecards alongside calculated insights.' : 'Loyalty numbers plus the vertical-specific customer scorecard (e.g. Athlete Insights, Patient Insights).');
  setText('step-3-insights-heading', b2b ? 'Calculated Insights' : 'Vertical Insights');
  setText('step-4-title', b2b ? 'Account Signals' : 'Affinities');
  setText('step-4-sub', b2b ? 'Optionally aggregate contacts’ interests and intent with company-level engagement signals.' : 'The dual-bar affinity chart. Each group has editable items with two configurable series (e.g. Views + Interaction).');
  setText('step-5-title', b2b ? 'Account Details & Relationships' : 'Preferences, Events & Membership');
  setText('step-5-sub', b2b ? 'Configure operational details, key stakeholders, products, contracts, and supporting account cards.' : 'The three stacked cards in the middle column.');
  setText('step-5-preferences-heading', b2b ? 'Account Details' : 'Preferences');
  setText('step-5-events-heading', b2b ? 'Key Stakeholders' : 'Events');
  setText('step-5-membership-heading', b2b ? 'Products & Contracts' : 'Membership Details');
  setText('step-6-title', b2b ? 'Next Best Actions & Account Activity' : 'Einstein Recommendations & Activity');
  setText('step-6-sub', b2b ? 'The account action center: recommended plays, renewal signals, and relationship activity.' : 'The right column: AI-powered recommendation cards and the engagement timeline.');
  setText('step-6-recs-heading', b2b ? 'Next Best Actions' : 'Einstein Recommendations');
  setText('step-6-activity-heading', b2b ? 'Account Activity' : 'Engagement Activity');
  setText('layout-title', b2b ? 'Account Workspace Widths' : 'Layout Widths (pixels)');
  setText('layout-sub', b2b ? 'Adjust the persistent account rail and the contextual action rail. The selected workspace tab fills the remaining fixed export canvas.' : 'Widen the left/middle columns if long values (e.g. "Platinum Partner") wrap onto two lines. Right column absorbs the remainder.');
  setText('left-col-w-label', b2b ? 'Account Rail' : 'Left Column (Profile)');
  setText('middle-col-w-label', b2b ? 'Action Rail' : 'Middle Column');
}

function setProfileType(profileType) {
  const next = profileType === 'b2b' ? 'b2b' : 'b2c';
  if ((state.profileType || 'b2c') === next) return;
  if (currentStep > 0 && !confirm(`Switching to a ${next === 'b2b' ? 'B2B account' : 'B2C individual'} profile replaces mode-specific fields. Brand styling and website analysis are retained. Continue?`)) return;

  const key = state._industry || document.getElementById('brand-industry')?.value || 'recruiting';
  const nextState = cloneProfileMode(next, key);
  // Preserve the parts that belong to the customer brand rather than the
  // generated profile. This makes switching modes feel deliberate, not reset.
  nextState._industry = key;
  nextState.brandName = state.brandName || nextState.brandName;
  nextState.appName = state.appName || nextState.appName;
  nextState.logo = state.logo || '';
  nextState.userAvatar = state.userAvatar || '';
  nextState.userName = state.userName || '';
  nextState.colors = Object.assign({}, nextState.colors, state.colors || {});
  nextState.navLinks = Array.isArray(state.navLinks) && state.navLinks.length ? state.navLinks : nextState.navLinks;
  nextState.layout = Object.assign({}, nextState.layout, state.layout || {});
  nextState.profileStrategy = Object.assign({}, getProfileStrategy());
  // B2C and B2B have different data contracts, so their working views begin
  // fresh after a mode change while retaining the current persona choice.
  nextState.personaVariants = {};
  applyPersonaPreset(nextState);
  applyPersonaSampleTemplate(nextState);
  snapshotPersonaView(nextState);
  state = nextState;
  fillStaticFields();
  renderAll();
  refreshPreview();
}

// Debounce the preview iframe refresh — every keystroke otherwise re-parses a big HTML doc.
let previewTimer = null;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const iframe = document.getElementById('preview-iframe');
    if (!iframe) return;
    const html = generateProfileHTML(state);
    iframe.srcdoc = html;
  }, 120);
}

// The iframe renders at a fixed 1300×860 desktop viewport, then we scale
// it down to fit the preview pane. This gives a miniature of the actual
// export instead of the collapsed narrow-column layout.
function fitPreviewScale() {
  const stage = document.getElementById('preview-stage');
  const iframe = document.getElementById('preview-iframe');
  if (!stage || !iframe) return;
  const scale = stage.clientWidth / 1300;
  iframe.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitPreviewScale);

// ─── STATE ↔ DOM binding ────────────────────────────────────

function fillStaticFields() {
  if (!state.profileType) state.profileType = 'b2c';
  getProfileStrategy();
  document.getElementById('brand-name').value = state.brandName || '';
  document.getElementById('brand-industry').value = state._industry || 'recruiting';
  document.getElementById('app-name').value = state.appName || 'Data Cloud';
  document.getElementById('url-logo').value = state.logo && !state.logo.startsWith('data:') ? state.logo : '';
  setImagePreviewFromURL('preview-logo', state.logo);

  document.getElementById('url-user-avatar').value = state.userAvatar && !state.userAvatar.startsWith('data:') ? state.userAvatar : '';
  setImagePreviewFromURL('preview-user-avatar', state.userAvatar);

  document.getElementById('color-primary').value = state.colors.primary;
  document.getElementById('hex-primary').value = state.colors.primary;
  document.getElementById('color-accent').value = state.colors.accent;
  document.getElementById('hex-accent').value = state.colors.accent;
  document.getElementById('color-secondary').value = state.colors.secondary;
  document.getElementById('hex-secondary').value = state.colors.secondary;
  document.getElementById('color-menu').value = state.colors.menu;
  document.getElementById('hex-menu').value = state.colors.menu;
  document.getElementById('color-menuText').value = state.colors.menuText;
  document.getElementById('hex-menuText').value = state.colors.menuText;
  document.getElementById('color-pageBg').value = state.colors.pageBg || '#EAF5FE';
  document.getElementById('hex-pageBg').value = state.colors.pageBg || '#EAF5FE';

  if (!state.layout) state.layout = { leftColWidth: 290, middleColWidth: 320 };
  document.getElementById('left-col-w').value = state.layout.leftColWidth;
  document.getElementById('left-col-w-val').textContent = state.layout.leftColWidth + 'px';
  document.getElementById('middle-col-w').value = state.layout.middleColWidth;
  document.getElementById('middle-col-w-val').textContent = state.layout.middleColWidth + 'px';

  document.getElementById('profile-name').value = state.profile.name;
  document.getElementById('profile-city').value = state.profile.city;
  document.getElementById('profile-customerId').value = state.profile.customerId;
  document.getElementById('profile-email').value = state.profile.email;
  document.getElementById('profile-phone').value = state.profile.phone;
  document.getElementById('secondary-email-include').checked = !!state.profile.secondaryEmailInclude;
  document.getElementById('secondary-email-label').value = state.profile.secondaryEmailLabel || 'Secondary Email';
  document.getElementById('secondary-email-value').value = state.profile.secondaryEmail || '';
  document.getElementById('profile-address').value = state.profile.address;
  document.getElementById('profile-segment').value = state.profile.segment;
  document.getElementById('url-photo').value = state.profile.photo && !state.profile.photo.startsWith('data:') ? state.profile.photo : '';
  setImagePreviewFromURL('preview-photo', state.profile.photo);

  document.getElementById('loyalty-title').value = state.loyalty.title;
  document.getElementById('loyalty-memberId').value = state.loyalty.memberId;
  document.getElementById('loyalty-tier').value = state.loyalty.tier;
  document.getElementById('loyalty-points').value = state.loyalty.points;
  document.getElementById('loyalty-redeemedPoints').value = state.loyalty.redeemedPoints;

  document.getElementById('insights-title').value = state.insights.title;
  document.getElementById('affinities-title').value = state.affinities.title;
  document.getElementById('seriesA-label').value = state.affinities.seriesA.label;
  document.getElementById('seriesA-color').value = state.affinities.seriesA.color;
  document.getElementById('seriesA-color-hex').value = state.affinities.seriesA.color;
  document.getElementById('seriesB-label').value = state.affinities.seriesB.label;
  document.getElementById('seriesB-color').value = state.affinities.seriesB.color;
  document.getElementById('seriesB-color-hex').value = state.affinities.seriesB.color;

  document.getElementById('preferences-title').value = state.preferences.title;
  document.getElementById('preferences-icon').value = state.preferences.icon || '';
  document.getElementById('events-title').value = state.events.title;
  document.getElementById('events-icon').value = state.events.icon || '';
  document.getElementById('membership-title').value = state.membership.title;
  document.getElementById('membership-icon').value = state.membership.icon || '';
  document.getElementById('recs-title').value = state.recommendations.title;
  document.getElementById('activity-title').value = state.activity.title;
  document.getElementById('tab-name').value = state.tabName;

  const account = state.account || {};
  const metrics = state.accountMetrics || {};
  const fillAccount = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
  fillAccount('account-name', account.name);
  fillAccount('account-headquarters', account.headquarters);
  fillAccount('account-id', account.accountId);
  fillAccount('account-industry', account.industry);
  fillAccount('account-type', account.type);
  fillAccount('account-owner', account.owner);
  fillAccount('account-website', account.website);
  fillAccount('account-employees', account.employees);
  fillAccount('account-tier', account.tier);
  fillAccount('account-parent', account.parentAccount);
  fillAccount('account-address', account.address);
  fillAccount('metric-revenue', metrics.revenue);
  fillAccount('metric-revenue-trend', metrics.revenueTrend);
  fillAccount('metric-pipeline', metrics.pipeline);
  fillAccount('metric-usage-score', metrics.usageScore);
  fillAccount('metric-usage-trend', metrics.usageTrend);
  fillAccount('metric-active-users', metrics.activeUsers);
  fillAccount('metric-health-score', metrics.healthScore);
  fillAccount('metric-health-trend', metrics.healthTrend);
  fillAccount('metric-support-cases', metrics.supportCases);
  fillAccount('metric-renewal-date', metrics.renewalDate);
  const affinityToggle = document.getElementById('account-affinities-include');
  if (affinityToggle) affinityToggle.checked = state.affinities.includeAggregate !== false;
  if (isB2B()) {
    const sections = getB2BSections();
    Object.keys(B2B_SECTION_DEFAULTS).forEach(key => {
      const toggle = document.getElementById(`b2b-section-${key.replace(/[A-Z]/g, match => '-' + match.toLowerCase())}`);
      if (toggle) toggle.checked = sections[key] !== false;
    });
  } else {
    const sections = getB2CSections();
    Object.keys(B2C_SECTION_DEFAULTS).forEach(key => {
      const toggle = document.getElementById(`b2c-section-${key}`);
      if (toggle) toggle.checked = sections[key] !== false;
    });
  }
  updateProfileModeUI();
  updateProfileStrategyUI();
}

function readStaticFields() {
  const strategy = getProfileStrategy();
  strategy.objective = document.getElementById('strategy-objective')?.value || strategy.objective;
  strategy.brief = document.getElementById('strategy-brief')?.value || '';
  strategy.customRole = document.getElementById('strategy-custom-role')?.value.trim() || '';
  state.brandName = document.getElementById('brand-name').value;
  state.appName = document.getElementById('app-name').value;
  state.colors.primary = document.getElementById('hex-primary').value;
  state.colors.accent = document.getElementById('hex-accent').value;
  state.colors.secondary = document.getElementById('hex-secondary').value;
  state.colors.menu = document.getElementById('hex-menu').value;
  state.colors.menuText = document.getElementById('hex-menuText').value;
  state.colors.pageBg = document.getElementById('hex-pageBg').value;

  state.profile.name = document.getElementById('profile-name').value;
  state.profile.city = document.getElementById('profile-city').value;
  state.profile.customerId = document.getElementById('profile-customerId').value;
  state.profile.email = document.getElementById('profile-email').value;
  state.profile.phone = document.getElementById('profile-phone').value;
  state.profile.secondaryEmailInclude = document.getElementById('secondary-email-include').checked;
  state.profile.secondaryEmailLabel = document.getElementById('secondary-email-label').value;
  state.profile.secondaryEmail = document.getElementById('secondary-email-value').value;
  state.profile.address = document.getElementById('profile-address').value;
  state.profile.segment = document.getElementById('profile-segment').value;

  state.loyalty.title = document.getElementById('loyalty-title').value;
  state.loyalty.memberId = document.getElementById('loyalty-memberId').value;
  state.loyalty.tier = document.getElementById('loyalty-tier').value;
  state.loyalty.points = document.getElementById('loyalty-points').value;
  state.loyalty.redeemedPoints = document.getElementById('loyalty-redeemedPoints').value;

  state.insights.title = document.getElementById('insights-title').value;
  state.affinities.title = document.getElementById('affinities-title').value;
  state.affinities.seriesA.label = document.getElementById('seriesA-label').value;
  state.affinities.seriesA.color = document.getElementById('seriesA-color').value;
  state.affinities.seriesB.label = document.getElementById('seriesB-label').value;
  state.affinities.seriesB.color = document.getElementById('seriesB-color').value;

  state.preferences.title = document.getElementById('preferences-title').value;
  state.preferences.icon = document.getElementById('preferences-icon').value;
  state.events.title = document.getElementById('events-title').value;
  state.events.icon = document.getElementById('events-icon').value;
  state.membership.title = document.getElementById('membership-title').value;
  state.membership.icon = document.getElementById('membership-icon').value;
  state.recommendations.title = document.getElementById('recs-title').value;
  state.activity.title = document.getElementById('activity-title').value;
  state.tabName = document.getElementById('tab-name').value;

  if (isB2B()) {
    if (!state.account) state.account = {};
    if (!state.accountMetrics) state.accountMetrics = {};
    const readAccount = (id) => document.getElementById(id)?.value || '';
    state.account.name = readAccount('account-name');
    state.account.headquarters = readAccount('account-headquarters');
    state.account.accountId = readAccount('account-id');
    state.account.industry = readAccount('account-industry');
    state.account.type = readAccount('account-type');
    state.account.owner = readAccount('account-owner');
    state.account.website = readAccount('account-website');
    state.account.employees = readAccount('account-employees');
    state.account.tier = readAccount('account-tier');
    state.account.parentAccount = readAccount('account-parent');
    state.account.address = readAccount('account-address');
    state.accountMetrics.revenue = readAccount('metric-revenue');
    state.accountMetrics.revenueTrend = readAccount('metric-revenue-trend');
    state.accountMetrics.pipeline = readAccount('metric-pipeline');
    state.accountMetrics.usageScore = readAccount('metric-usage-score');
    state.accountMetrics.usageTrend = readAccount('metric-usage-trend');
    state.accountMetrics.activeUsers = readAccount('metric-active-users');
    state.accountMetrics.healthScore = readAccount('metric-health-score');
    state.accountMetrics.healthTrend = readAccount('metric-health-trend');
    state.accountMetrics.supportCases = readAccount('metric-support-cases');
    state.accountMetrics.renewalDate = readAccount('metric-renewal-date');
    state.affinities.includeAggregate = !!document.getElementById('account-affinities-include')?.checked;
    const sections = getB2BSections();
    Object.keys(B2B_SECTION_DEFAULTS).forEach(key => {
      const toggle = document.getElementById(`b2b-section-${key.replace(/[A-Z]/g, match => '-' + match.toLowerCase())}`);
      if (toggle) sections[key] = toggle.checked;
    });
    state.tabName = state.account.name || state.tabName;
  } else {
    const sections = getB2CSections();
    Object.keys(B2C_SECTION_DEFAULTS).forEach(key => {
      const toggle = document.getElementById(`b2c-section-${key}`);
      if (toggle) sections[key] = toggle.checked;
    });
  }
}

// Called by every input onchange. Read → re-render dynamic lists that
// depend on state? No — dynamic lists own their own state via row edits.
function onFieldChange() {
  readStaticFields();
  refreshPreview();
}

function onHexChange(key) {
  const v = document.getElementById('hex-' + key).value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    document.getElementById('color-' + key).value = v;
    onFieldChange();
  }
}

// Slider-driven column widths — update state, echo px, refresh preview.
function onLayoutChange(field, value) {
  if (!state.layout) state.layout = { leftColWidth: 290, middleColWidth: 320 };
  const n = Math.max(220, Math.min(500, +value));
  state.layout[field] = n;
  const echo = document.getElementById(field === 'leftColWidth' ? 'left-col-w-val' : 'middle-col-w-val');
  if (echo) echo.textContent = n + 'px';
  refreshPreview();
}
function onColorChange() {
  ['primary', 'accent', 'secondary', 'menu', 'menuText', 'pageBg'].forEach(k => {
    document.getElementById('hex-' + k).value = document.getElementById('color-' + k).value;
  });
  onFieldChange();
}
function onSeriesHexChange(which) {
  const v = document.getElementById(`series${which}-color-hex`).value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    document.getElementById(`series${which}-color`).value = v;
    onFieldChange();
  }
}

function onIndustryChange() {
  if (!confirm('Switching industry will replace all field values with the new industry\'s defaults. Continue?')) {
    document.getElementById('brand-industry').value = state._industry || 'recruiting';
    return;
  }
  const key = document.getElementById('brand-industry').value;
  const strategy = Object.assign({}, getProfileStrategy());
  state = cloneProfileMode(state.profileType || 'b2c', key);
  state._industry = key;
  state.brandName = INDUSTRY_DEFAULTS[key].label;
  state.logo = '';
  state.userAvatar = '';
  state.profileStrategy = strategy;
  state.personaVariants = {};
  applyPersonaPreset();
  applyPersonaSampleTemplate();
  snapshotPersonaView();
  fillStaticFields();
  renderAll();
  refreshPreview();
}

// ─── DYNAMIC LIST RENDERERS ─────────────────────────────────

function renderInsights() {
  const c = document.getElementById('insights-container');
  c.innerHTML = state.insights.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.icon)}" class="col-span-1 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-center" oninput="state.insights.items[${i}].icon=this.value; refreshPreview()" title="Icon/emoji">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.insights.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-6 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.insights.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeInsight(${i})">×</button>
      </div>
    </div>`).join('');
}
function addInsight() { state.insights.items.push({ icon: '📊', label: 'New Metric', value: '—' }); renderInsights(); refreshPreview(); }
function removeInsight(i) { state.insights.items.splice(i, 1); renderInsights(); refreshPreview(); }

function renderAffinityGroups() {
  const c = document.getElementById('affinity-groups-container');
  c.innerHTML = state.affinities.groups.map((g, gi) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-3">
        <input type="text" value="${escAttr(g.name)}" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" placeholder="Group name" oninput="state.affinities.groups[${gi}].name=this.value; refreshPreview()">
        <button class="icon-btn danger" onclick="removeAffinityGroup(${gi})">Remove group</button>
      </div>
      <div class="space-y-2">
        ${g.items.map((it, ii) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.affinities.groups[${gi}].items[${ii}].label=this.value; refreshPreview()">
            <div class="col-span-3 flex items-center gap-1">
              <span class="text-[10px] font-600 text-gray-500">A</span>
              <input type="range" min="0" max="100" value="${it.a}" class="flex-1" oninput="state.affinities.groups[${gi}].items[${ii}].a=+this.value; this.nextElementSibling.textContent=this.value+'%'; refreshPreview()">
              <span class="text-[10px] w-8 text-right text-gray-500">${it.a}%</span>
            </div>
            <div class="col-span-3 flex items-center gap-1">
              <span class="text-[10px] font-600 text-gray-500">B</span>
              <input type="range" min="0" max="100" value="${it.b}" class="flex-1" oninput="state.affinities.groups[${gi}].items[${ii}].b=+this.value; this.nextElementSibling.textContent=this.value+'%'; refreshPreview()">
              <span class="text-[10px] w-8 text-right text-gray-500">${it.b}%</span>
            </div>
            <button class="col-span-2 icon-btn danger" onclick="removeAffinityItem(${gi}, ${ii})">Remove</button>
          </div>`).join('')}
      </div>
      <button onclick="addAffinityItem(${gi})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');
}
function addAffinityGroup() { state.affinities.groups.push({ name: 'New Group', items: [{ label: 'Item', a: 50, b: 50 }] }); renderAffinityGroups(); refreshPreview(); }
function removeAffinityGroup(i) { state.affinities.groups.splice(i, 1); renderAffinityGroups(); refreshPreview(); }
function addAffinityItem(gi) { state.affinities.groups[gi].items.push({ label: 'New', a: 50, b: 50 }); renderAffinityGroups(); refreshPreview(); }
function removeAffinityItem(gi, ii) { state.affinities.groups[gi].items.splice(ii, 1); renderAffinityGroups(); refreshPreview(); }

function renderPreferences() {
  const c = document.getElementById('preferences-container');
  c.innerHTML = state.preferences.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.preferences.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.preferences.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removePreference(${i})">×</button>
      </div>
    </div>`).join('');
}
function addPreference() { state.preferences.items.push({ label: 'New', value: '' }); renderPreferences(); refreshPreview(); }
function removePreference(i) { state.preferences.items.splice(i, 1); renderPreferences(); refreshPreview(); }

function renderEvents() {
  const c = document.getElementById('events-container');
  const b2b = isB2B();
  c.innerHTML = state.events.items.map((ev, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(ev.name)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="${b2b ? 'Stakeholder name' : 'Event name'}" oninput="state.events.items[${i}].name=this.value; refreshPreview()">
        <input type="text" value="${escAttr(ev.date)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="${b2b ? 'Role' : 'Date'}" oninput="state.events.items[${i}].date=this.value; refreshPreview()">
        <input type="text" value="${escAttr(ev.confirmation)}" class="col-span-3 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="${b2b ? 'Title' : 'Confirmation #'}" oninput="state.events.items[${i}].confirmation=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeEvent(${i})">×</button>
      </div>
    </div>`).join('');
}
function addEvent() { state.events.items.push({ name: isB2B() ? 'New Stakeholder' : 'New Event', date: '', confirmation: '' }); renderEvents(); refreshPreview(); }
function removeEvent(i) { state.events.items.splice(i, 1); renderEvents(); refreshPreview(); }

function renderMembership() {
  const c = document.getElementById('membership-container');
  c.innerHTML = state.membership.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.label)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Label" oninput="state.membership.items[${i}].label=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.value)}" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Value" oninput="state.membership.items[${i}].value=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeMembership(${i})">×</button>
      </div>
    </div>`).join('');
}
function addMembership() { state.membership.items.push({ label: 'New', value: '' }); renderMembership(); refreshPreview(); }
function removeMembership(i) { state.membership.items.splice(i, 1); renderMembership(); refreshPreview(); }

// Extra cards — user-added cards in the middle column to fill vertical
// space. Each card owns a title, icon (emoji or image URL/data URL),
// and any number of label/value rows.
function renderExtraCards() {
  const c = document.getElementById('extra-cards-container');
  normalizeCustomModules();
  c.innerHTML = state.extraCards.map((card, ci) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-2">
        <input type="text" value="${escAttr(card.title)}" placeholder="Card title" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" oninput="state.extraCards[${ci}].title=this.value; refreshPreview()">
        <select class="px-2 py-1.5 border border-gray-300 rounded text-xs font-600 outline-none" onchange="setCustomCardVisibility('extraCards', ${ci}, this.value)">
          <option value="visible" ${card.visibility === 'visible' ? 'selected' : ''}>Shown</option>
          <option value="suggested" ${card.visibility === 'suggested' ? 'selected' : ''}>Suggested</option>
          <option value="hidden" ${card.visibility === 'hidden' ? 'selected' : ''}>Hidden</option>
        </select>
        <button class="icon-btn danger" onclick="removeExtraCard(${ci})">Remove card</button>
      </div>
      <div class="grid grid-cols-12 gap-2 items-center mb-2">
        <input type="text" value="${escAttr(card.icon || '')}" placeholder="Icon (emoji or image URL)" class="col-span-9 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none font-mono" oninput="state.extraCards[${ci}].icon=this.value; refreshPreview()">
        <div id="drop-extra-icon-${ci}" class="col-span-3 drop-zone-sf p-2 text-center cursor-pointer text-[10px]">📷 Upload</div>
      </div>
      <div class="space-y-2">
        ${(card.items || []).map((it, ri) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" placeholder="Label" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.extraCards[${ci}].items[${ri}].label=this.value; refreshPreview()">
            <input type="text" value="${escAttr(it.value)}" placeholder="Value" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.extraCards[${ci}].items[${ri}].value=this.value; refreshPreview()">
            <button class="col-span-1 icon-btn danger" onclick="removeExtraCardRow(${ci}, ${ri})">×</button>
          </div>`).join('')}
      </div>
      <button onclick="addExtraCardRow(${ci})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');

  // Wire icon drop zones for each extra card
  state.extraCards.forEach((_, ci) => {
    attachDropZone(`drop-extra-icon-${ci}`, null, (dataUrl) => {
      state.extraCards[ci].icon = dataUrl;
      renderExtraCards();
      refreshPreview();
    });
  });
}
function addExtraCard() {
  normalizeCustomModules();
  state.extraCards.push({
    moduleId: `module-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'New Section',
    icon: '📋',
    items: [
      { label: 'Field 1', value: '' },
      { label: 'Field 2', value: '' }
    ],
    placement: 'middle', visibility: 'visible'
  });
  renderExtraCards();
  refreshPreview();
}
function removeExtraCard(i) { state.extraCards.splice(i, 1); renderExtraCards(); refreshPreview(); }
function addExtraCardRow(ci) { state.extraCards[ci].items.push({ label: '', value: '' }); renderExtraCards(); refreshPreview(); }
function removeExtraCardRow(ci, ri) { state.extraCards[ci].items.splice(ri, 1); renderExtraCards(); refreshPreview(); }

// Right-column custom cards — render under Membership Details in the
// right-bottom-left column, opposite Engagement Activity. Same shape
// as middle-column extraCards to keep the editor familiar.
function renderRightExtraCards() {
  const c = document.getElementById('right-extra-cards-container');
  if (!c) return;
  normalizeCustomModules();
  c.innerHTML = state.rightExtraCards.map((card, ci) => `
    <div class="row-card">
      <div class="flex items-center gap-2 mb-2">
        <input type="text" value="${escAttr(card.title)}" placeholder="Card title" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-600 outline-none" oninput="state.rightExtraCards[${ci}].title=this.value; refreshPreview()">
        <select class="px-2 py-1.5 border border-gray-300 rounded text-xs font-600 outline-none" onchange="setCustomCardVisibility('rightExtraCards', ${ci}, this.value)">
          <option value="visible" ${card.visibility === 'visible' ? 'selected' : ''}>Shown</option>
          <option value="suggested" ${card.visibility === 'suggested' ? 'selected' : ''}>Suggested</option>
          <option value="hidden" ${card.visibility === 'hidden' ? 'selected' : ''}>Hidden</option>
        </select>
        <button class="icon-btn danger" onclick="removeRightExtraCard(${ci})">Remove card</button>
      </div>
      <div class="grid grid-cols-12 gap-2 items-center mb-2">
        <input type="text" value="${escAttr(card.icon || '')}" placeholder="Icon (emoji or image URL)" class="col-span-9 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none font-mono" oninput="state.rightExtraCards[${ci}].icon=this.value; refreshPreview()">
        <div id="drop-right-extra-icon-${ci}" class="col-span-3 drop-zone-sf p-2 text-center cursor-pointer text-[10px]">📷 Upload</div>
      </div>
      <div class="space-y-2">
        ${(card.items || []).map((it, ri) => `
          <div class="grid grid-cols-12 gap-2 items-center">
            <input type="text" value="${escAttr(it.label)}" placeholder="Label" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.rightExtraCards[${ci}].items[${ri}].label=this.value; refreshPreview()">
            <input type="text" value="${escAttr(it.value)}" placeholder="Value" class="col-span-7 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" oninput="state.rightExtraCards[${ci}].items[${ri}].value=this.value; refreshPreview()">
            <button class="col-span-1 icon-btn danger" onclick="removeRightExtraCardRow(${ci}, ${ri})">×</button>
          </div>`).join('')}
      </div>
      <button onclick="addRightExtraCardRow(${ci})" class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 text-xs font-600 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">+ Add Row</button>
    </div>`).join('');

  state.rightExtraCards.forEach((_, ci) => {
    attachDropZone(`drop-right-extra-icon-${ci}`, null, (dataUrl) => {
      state.rightExtraCards[ci].icon = dataUrl;
      renderRightExtraCards();
      refreshPreview();
    });
  });
}
function addRightExtraCard() {
  normalizeCustomModules();
  state.rightExtraCards.push({
    moduleId: `module-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'New Section',
    icon: '📋',
    items: [
      { label: 'Field 1', value: '' },
      { label: 'Field 2', value: '' }
    ],
    placement: 'right', visibility: 'visible'
  });
  renderRightExtraCards();
  refreshPreview();
}
function removeRightExtraCard(i) { state.rightExtraCards.splice(i, 1); renderRightExtraCards(); refreshPreview(); }
function addRightExtraCardRow(ci) { state.rightExtraCards[ci].items.push({ label: '', value: '' }); renderRightExtraCards(); refreshPreview(); }
function removeRightExtraCardRow(ci, ri) { state.rightExtraCards[ci].items.splice(ri, 1); renderRightExtraCards(); refreshPreview(); }

function setCustomCardVisibility(bucket, index, visibility) {
  normalizeCustomModules();
  const card = state[bucket]?.[index];
  if (!card) return;
  card.visibility = visibility;
  renderAll();
  refreshPreview();
}

function findCustomModule(moduleId) {
  normalizeCustomModules();
  for (const bucket of ['extraCards', 'rightExtraCards']) {
    const index = state[bucket].findIndex(card => card.moduleId === moduleId);
    if (index !== -1) return { bucket, index, card: state[bucket][index] };
  }
  return null;
}

function moveCustomModule(moduleId, destination) {
  const found = findCustomModule(moduleId);
  if (!found) return;
  const [card] = state[found.bucket].splice(found.index, 1);
  if (destination === 'suggested') {
    card.visibility = 'suggested';
    state[card.placement === 'right' ? 'rightExtraCards' : 'extraCards'].push(card);
  } else {
    card.placement = destination;
    card.visibility = 'visible';
    state[destination === 'right' ? 'rightExtraCards' : 'extraCards'].push(card);
  }
  renderAll();
  refreshPreview();
}

function onModuleDragStart(event, moduleId) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', moduleId);
}

function allowModuleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.add('module-composer-drop-active');
}

function clearModuleDrop(event) {
  event.currentTarget.classList.remove('module-composer-drop-active');
}

function dropModule(event, destination) {
  event.preventDefault();
  clearModuleDrop(event);
  moveCustomModule(event.dataTransfer.getData('text/plain'), destination);
}

function renderModuleComposer() {
  const container = document.getElementById('module-composer');
  if (!container) return;
  const modules = getCustomModules();
  const zones = {
    middle: modules.filter(card => card.visibility === 'visible' && card.placement === 'middle'),
    right: modules.filter(card => card.visibility === 'visible' && card.placement === 'right'),
    suggested: modules.filter(card => card.visibility === 'suggested')
  };
  const zone = (key, title, description) => `
    <div class="module-composer-zone" ondragover="allowModuleDrop(event)" ondragleave="clearModuleDrop(event)" ondrop="dropModule(event, '${key}')">
      <div class="module-composer-zone-title">${title}</div>
      <p>${description}</p>
      ${zones[key].length ? zones[key].map(card => `
        <div class="module-composer-card" draggable="true" ondragstart="onModuleDragStart(event, '${escAttr(card.moduleId)}')">
          <span class="module-composer-grip">⠿</span><span>${raw(card.icon || '📋')}</span><strong>${esc(card.title || 'Custom section')}</strong>
          ${key === 'suggested' ? `<button type="button" onclick="moveCustomModule('${escAttr(card.moduleId)}', 'middle')">Show</button>` : `<button type="button" onclick="moveCustomModule('${escAttr(card.moduleId)}', 'suggested')">Stash</button>`}
        </div>`).join('') : `<div class="module-composer-empty">Drop a card here</div>`}
    </div>`;
  container.innerHTML = `${zone('middle', 'Middle column', 'Below preferences')}${zone('right', 'Right column', 'Below products / offers')}${zone('suggested', 'Suggested library', 'Available but not on the first screen')}`;
}

function renderRecs() {
  const c = document.getElementById('recs-container');
  c.innerHTML = state.recommendations.items.map((rec, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-start">
        <div class="col-span-11 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <input type="text" value="${escAttr(rec.eyebrow)}" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Eyebrow (e.g. Next Best Action:)" oninput="state.recommendations.items[${i}].eyebrow=this.value; refreshPreview()">
            <input type="text" value="${escAttr(rec.cta)}" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Button text" oninput="state.recommendations.items[${i}].cta=this.value; refreshPreview()">
          </div>
          <input type="text" value="${escAttr(rec.title)}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Title" oninput="state.recommendations.items[${i}].title=this.value; refreshPreview()">
          <input type="text" value="${escAttr(rec.image)}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs outline-none font-mono" placeholder="Image URL" oninput="state.recommendations.items[${i}].image=this.value; refreshPreview()">
          <div id="rec-drop-${i}" class="drop-zone-sf p-3 text-center cursor-pointer">
            ${rec.image ? `<img src="${escAttr(rec.image)}" class="w-full h-20 object-cover rounded mb-2">` : ''}
            <p class="text-[11px] text-gray-500">📷 Drop image or click to upload</p>
          </div>
        </div>
        <button class="col-span-1 icon-btn danger" onclick="removeRec(${i})">×</button>
      </div>
    </div>`).join('');
  // Wire drop zones after render
  state.recommendations.items.forEach((_, i) => {
    attachDropZone(`rec-drop-${i}`, null, (dataUrl) => {
      state.recommendations.items[i].image = dataUrl;
      renderRecs();
      refreshPreview();
    });
  });
}
function addRec() { state.recommendations.items.push({ eyebrow: 'Recommended:', title: 'New Recommendation', cta: 'Suggest', image: '' }); renderRecs(); refreshPreview(); }
function removeRec(i) { state.recommendations.items.splice(i, 1); renderRecs(); refreshPreview(); }

function renderActivity() {
  const c = document.getElementById('activity-container');
  c.innerHTML = state.activity.items.map((it, i) => `
    <div class="row-card">
      <div class="grid grid-cols-12 gap-2 items-center">
        <input type="text" value="${escAttr(it.icon)}" class="col-span-1 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-center" oninput="state.activity.items[${i}].icon=this.value; refreshPreview()" title="Icon/emoji">
        <input type="text" value="${escAttr(it.title)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Title" oninput="state.activity.items[${i}].title=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.body)}" class="col-span-4 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Body (HTML allowed)" oninput="state.activity.items[${i}].body=this.value; refreshPreview()">
        <input type="text" value="${escAttr(it.time)}" class="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm outline-none" placeholder="Time" oninput="state.activity.items[${i}].time=this.value; refreshPreview()">
        <button class="col-span-1 icon-btn danger" onclick="removeActivity(${i})">×</button>
      </div>
    </div>`).join('');
}
function addActivity() { state.activity.items.push({ icon: '🎯', title: 'New Event', body: '', time: 'just now' }); renderActivity(); refreshPreview(); }
function removeActivity(i) { state.activity.items.splice(i, 1); renderActivity(); refreshPreview(); }

function renderNavLinks() {
  const c = document.getElementById('nav-links-container');
  c.innerHTML = state.navLinks.map((l, i) => `
    <span class="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-xs font-600">
      ${escHTML(l)}
      <button class="text-gray-400 hover:text-red-500" onclick="removeNavLink(${i})">×</button>
    </span>`).join('');
}
function addNavLink() {
  const inp = document.getElementById('new-nav-link');
  const v = inp.value.trim();
  if (!v) return;
  state.navLinks.push(v);
  inp.value = '';
  renderNavLinks();
  refreshPreview();
}
function removeNavLink(i) { state.navLinks.splice(i, 1); renderNavLinks(); refreshPreview(); }

// ─── ESCAPE HELPERS (for wizard-side rendering) ─────────────
function escAttr(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escHTML(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ─── STEP NAVIGATION ────────────────────────────────────────
function goToStep(n) {
  currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, n));
  document.querySelectorAll('.step-panel').forEach(p => {
    p.classList.toggle('active', +p.dataset.step === currentStep);
  });
  document.querySelectorAll('#step-indicators .step-dot').forEach(d => {
    const i = +d.dataset.step;
    d.classList.toggle('active', i === currentStep);
    d.classList.toggle('completed', i < currentStep);
  });
  document.getElementById('btn-prev').classList.toggle('hidden', currentStep === 0);
  document.getElementById('btn-next').textContent = currentStep === TOTAL_STEPS - 1 ? 'Done' : 'Next →';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function nextStep() { if (currentStep < TOTAL_STEPS - 1) goToStep(currentStep + 1); }
function prevStep() { if (currentStep > 0) goToStep(currentStep - 1); }

// ─── URL & IMAGE INPUTS ─────────────────────────────────────
function onLogoUrlChange() {
  const v = document.getElementById('url-logo').value.trim();
  state.logo = v;
  setImagePreviewFromURL('preview-logo', v);
  refreshPreview();
}
function onUserAvatarUrlChange() {
  const v = document.getElementById('url-user-avatar').value.trim();
  state.userAvatar = v;
  setImagePreviewFromURL('preview-user-avatar', v);
  refreshPreview();
}
function onPhotoUrlChange() {
  const v = document.getElementById('url-photo').value.trim();
  state.profile.photo = v;
  setImagePreviewFromURL('preview-photo', v);
  refreshPreview();
}

// ─── START OVER + EXPORT ───────────────────────────────────
function startOver() {
  if (!confirm('Reset everything back to industry defaults?')) return;
  const profileType = state.profileType || 'b2c';
  const key = document.getElementById('brand-industry').value || 'generic';
  state = profileType === 'b2b' ? cloneAccountIndustry(key) : cloneTonyRobbinsStarter();
  state._industry = profileType === 'b2b' ? key : 'generic';
  applyPersonaPreset();
  applyPersonaSampleTemplate();
  snapshotPersonaView();
  fillStaticFields();
  renderAll();
  goToStep(0);
  refreshPreview();
}

async function downloadHTML() {
  // Convert bundled starter artwork to data URLs before downloading so the
  // exported HTML continues to show its recommendation images anywhere.
  if (typeof hydrateBundledStarterImages === 'function') await hydrateBundledStarterImages(state);
  const html = generateProfileHTML(state);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = (state.profile.name || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const strategy = getProfileStrategy();
  const persona = getProfileStrategyLabel(strategy).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
  a.download = `unified-profile-${name}-${persona}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function fitPresentationScale() {
  const canvas = document.getElementById('presentation-canvas');
  const stage = document.getElementById('presentation-stage');
  const iframe = document.getElementById('presentation-iframe');
  if (!canvas || !stage || !iframe) return;
  const scale = Math.min((canvas.clientWidth - 32) / 1300, (canvas.clientHeight - 32) / 860, 1);
  stage.style.width = `${Math.max(1, 1300 * scale)}px`;
  stage.style.height = `${Math.max(1, 860 * scale)}px`;
  iframe.style.transform = `scale(${scale})`;
}

function openPresentation() {
  readStaticFields();
  document.getElementById('presentation-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'presentation-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Unified profile presentation');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:#0f172a;display:flex;flex-direction:column;padding:12px;';
  overlay.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;padding:0 4px 10px;font:600 13px Salesforce Sans,system-ui,sans-serif;"><span>Unified Profile Presentation</span><div style="display:flex;gap:8px;"><button id="presentation-fullscreen" type="button" style="border:1px solid #64748b;border-radius:6px;background:#1e293b;color:#fff;padding:7px 10px;cursor:pointer;">Full screen</button><button id="presentation-close" type="button" style="border:1px solid #64748b;border-radius:6px;background:#fff;color:#0f172a;padding:7px 10px;cursor:pointer;">Close</button></div></div><div id="presentation-canvas" style="flex:1;min-height:0;display:grid;place-items:center;overflow:hidden;"><div id="presentation-stage" style="position:relative;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.35);"><iframe id="presentation-iframe" title="Unified profile presentation" sandbox="allow-scripts" style="position:absolute;top:0;left:0;width:1300px;height:860px;border:0;transform-origin:0 0;"></iframe></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#presentation-close').addEventListener('click', close);
  overlay.querySelector('#presentation-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else overlay.requestFullscreen?.();
  });
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.getElementById('presentation-iframe').srcdoc = generateProfileHTML(state);
  const onKey = event => { if (event.key === 'Escape' && document.getElementById('presentation-overlay')) { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(fitPresentationScale);
  setTimeout(fitPresentationScale, 100);
}
window.addEventListener('resize', fitPresentationScale);
document.addEventListener('fullscreenchange', () => setTimeout(fitPresentationScale, 0));

function copyHTML() {
  const html = generateProfileHTML(state);
  showCopyModal(html);
  tryCopyToClipboard(html);
}

function tryCopyToClipboard(html, sourceTextarea) {
  const flashToast = () => {
    const s = document.getElementById('copy-success');
    if (!s) return;
    s.classList.remove('hidden');
    setTimeout(() => s.classList.add('hidden'), 2200);
  };
  const flashModalStatus = (msg, ok) => {
    const st = document.getElementById('copy-modal-status');
    if (!st) return;
    st.textContent = msg;
    st.className = 'text-sm font-600 ' + (ok ? 'text-green-700' : 'text-red-700');
    setTimeout(() => { st.textContent = ''; st.className = 'text-sm font-600'; }, 2500);
  };
  const legacyCopy = () => {
    try {
      const ta = sourceTextarea || document.getElementById('copy-modal-textarea');
      if (!ta) return false;
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      return !!ok;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(html).then(() => {
      flashToast();
      flashModalStatus('✓ Copied to clipboard', true);
    }).catch(() => {
      if (legacyCopy()) {
        flashToast();
        flashModalStatus('✓ Copied to clipboard', true);
      } else {
        flashModalStatus('Copy blocked — select the text and press ⌘/Ctrl+C', false);
      }
    });
  } else if (legacyCopy()) {
    flashToast();
    flashModalStatus('✓ Copied to clipboard', true);
  } else {
    flashModalStatus('Select the text and press ⌘/Ctrl+C to copy', false);
  }
}

function showCopyModal(html) {
  let modal = document.getElementById('copy-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'copy-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:900px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);overflow:hidden;">
        <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-weight:700;font-size:15px;color:#0f172a;">Copy Profile HTML</div>
          <button id="copy-modal-close-x" style="background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#64748b;padding:4px 8px;">×</button>
        </div>
        <div style="padding:12px 20px;font-size:13px;color:#475569;">Select-all is already applied. Click <b>Copy</b> below, or press ⌘/Ctrl+C.</div>
        <div style="padding:0 20px 12px;flex:1;overflow:hidden;display:flex;">
          <textarea id="copy-modal-textarea" readonly spellcheck="false" style="width:100%;flex:1;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.4;border:1px solid #cbd5e1;border-radius:8px;padding:10px;resize:none;background:#f8fafc;color:#0f172a;"></textarea>
        </div>
        <div style="padding:12px 20px 16px;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div id="copy-modal-status" class="text-sm font-600"></div>
          <div style="display:flex;gap:8px;">
            <button id="copy-modal-close" style="padding:8px 16px;font-size:13px;font-weight:600;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer;">Close</button>
            <button id="copy-modal-copy" style="padding:8px 16px;font-size:13px;font-weight:600;border-radius:8px;border:none;background:#0176d3;color:#fff;cursor:pointer;">Copy</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#copy-modal-close').addEventListener('click', close);
    modal.querySelector('#copy-modal-close-x').addEventListener('click', close);
    modal.querySelector('#copy-modal-copy').addEventListener('click', () => {
      const ta = document.getElementById('copy-modal-textarea');
      tryCopyToClipboard(ta ? ta.value : html, ta);
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && document.getElementById('copy-modal')) {
        close();
        document.removeEventListener('keydown', onEsc);
      }
    });
  }
  const ta = document.getElementById('copy-modal-textarea');
  if (ta) {
    ta.value = html;
    setTimeout(() => { ta.focus(); ta.select(); }, 40);
  }
}

function exportForCloudy() {
  downloadHTML();
  window.open('https://sfdc.co/cloudy', '_blank', 'noopener');
  const hint = document.getElementById('cloudy-hint');
  if (hint) {
    hint.classList.remove('hidden');
    setTimeout(() => hint.classList.add('hidden'), 6000);
  }
}

// ─── AI-driven ingest — apply parsed profile from URL analysis ─
function sanitizeAIActivityBody(value) {
  // Keep the useful lightweight emphasis AI can provide, while removing inline
  // color declarations that can make copy disappear against a white card.
  return String(value || '')
    .replace(/\sstyle\s*=\s*(['"])[^'"]*color\s*:[^;'"]*;?[^'"]*\1/gi, '')
    .replace(/\sstyle\s*=\s*([^\s>]*color\s*:[^;\s>]*[^\s>]*)/gi, '');
}

function applyAIProfile(ai) {
  // Preserve current industry unless AI came back with something else.
  const industry = ai.industry && INDUSTRY_DEFAULTS[ai.industry] ? ai.industry : (state._industry || 'recruiting');
  const profileType = state.profileType === 'b2b' ? 'b2b' : 'b2c';
  const base = cloneProfileMode(profileType, industry);
  base._industry = industry;
  base.profileStrategy = Object.assign({}, getProfileStrategy());
  const recommendationFallbacks = (base.recommendations?.items || []).map(item => item.image || '');

  base.brandName = ai.brandName || base.brandName || state.brandName;
  base.appName = profileType === 'b2b' ? 'Data Cloud' : (ai.appName || base.appName);
  base.tabName = ai.tabName || (profileType === 'b2b' ? ai.account?.name : ai.profile?.name) || base.tabName;

  if (ai.colors) {
    if (ai.colors.primary)   base.colors.primary = ai.colors.primary;
    if (ai.colors.secondary) base.colors.secondary = ai.colors.secondary;
  }
  // Keep the Salesforce navigation and recommendation canvas legible after
  // AI analysis. Users can still choose different values manually in Step 1.
  base.colors.accent = '#FFFFFF';
  base.colors.menu = '#FFFFFF';
  base.colors.menuText = '#000000';

  ['profile', 'loyalty', 'insights', 'affinities', 'preferences', 'events', 'membership', 'recommendations', 'activity'].forEach(k => {
    if (ai[k]) base[k] = Object.assign({}, base[k], ai[k]);
  });
  if (Array.isArray(base.recommendations?.items)) {
    base.recommendations.items = base.recommendations.items.map((item, index) => Object.assign({}, item, {
      image: item.image || recommendationFallbacks[index] || ''
    }));
  }
  if (Array.isArray(base.activity?.items)) {
    base.activity.items = base.activity.items.map(item => Object.assign({}, item, { body: sanitizeAIActivityBody(item.body) }));
  }
  if (profileType === 'b2b') {
    if (ai.account) base.account = Object.assign({}, base.account, ai.account);
    if (ai.accountMetrics) base.accountMetrics = Object.assign({}, base.accountMetrics, ai.accountMetrics);
    base.profileType = 'b2b';
    base.tabName = ai.tabName || base.account.name || base.tabName;
  }
  if (profileType !== 'b2b' && Array.isArray(ai.navLinks) && ai.navLinks.length) base.navLinks = ai.navLinks;
  // AI may identify valuable additional modules. Keep them in the builder as
  // suggestions so the initial profile remains a single presentable screen.
  if (profileType === 'b2c') {
    // A compact persona-specific card gives the main screen a balanced
    // information density; AI extras are then available as optional depth.
    base.extraCards = buildPersonaSupportingModules(base.profileStrategy.lens);
    base.rightExtraCards = [];
  }
  if (Array.isArray(ai.extraCards)) {
    const aiCards = ai.extraCards.map((card, index) => Object.assign({}, card, {
      moduleId: card.moduleId || `ai-middle-${index + 1}`,
      placement: 'middle', visibility: 'suggested'
    }));
    base.extraCards = (base.extraCards || []).concat(aiCards);
  }
  if (Array.isArray(ai.rightExtraCards)) {
    const aiCards = ai.rightExtraCards.map((card, index) => Object.assign({}, card, {
      moduleId: card.moduleId || `ai-right-${index + 1}`,
      placement: 'right', visibility: 'suggested'
    }));
    base.rightExtraCards = (base.rightExtraCards || []).concat(aiCards);
  }
  normalizeCustomModules(base);
  // The AI supplies the content, while the selected viewer lens owns the
  // information hierarchy and section names shown to the presenter.
  applyPersonaPreset(base);
  // New website analysis replaces modeled profile content, so previously
  // saved working views are no longer a safe match for this customer.
  base.personaVariants = {};
  snapshotPersonaView(base);

  // Prefer favicon as logo if AI didn't give us anything.
  if (ai._meta && ai._meta.favicon && !base.logo) base.logo = ai._meta.favicon;

  state = base;
  document.getElementById('brand-industry').value = industry;
  fillStaticFields();
  renderAll();
  refreshPreview();
}

function renderAll() {
  renderInsights();
  renderAffinityGroups();
  renderPreferences();
  renderEvents();
  renderMembership();
  renderExtraCards();
  renderRightExtraCards();
  renderModuleComposer();
  renderRecs();
  renderActivity();
  renderNavLinks();
}

// ─── SAASY AUTH / SAVE PROJECTS ─────────────────────────────
const SAASY_TOOL = 'upg';
let currentProjectId = null;
let currentProjectName = null;

function syncAuthUI() {
  if (!window.SaasyAuth) return;
  const btn = document.getElementById('btn-auth');
  const emailEl = document.getElementById('auth-email');
  if (SaasyAuth.isSignedIn()) {
    btn.textContent = 'Sign Out';
    emailEl.textContent = SaasyAuth.getEmail();
    emailEl.classList.remove('hidden');
  } else {
    btn.textContent = 'Sign In';
    emailEl.classList.add('hidden');
  }
}

async function onAuthButtonClick() {
  if (!window.SaasyAuth) return;
  if (SaasyAuth.isSignedIn()) {
    SaasyAuth.signOut();
    syncAuthUI();
    return;
  }
  try {
    await SaasyAuth.signIn();
    syncAuthUI();
  } catch (e) {
    // user cancelled sign-in — nothing to do
  }
}

async function saveCurrentProject() {
  if (!window.SaasyAuth) return;
  if (!SaasyAuth.isSignedIn()) {
    try { await SaasyAuth.signIn(); syncAuthUI(); } catch (e) { return; }
  }
  openSaveProjectModal();
}

function openSaveProjectModal() {
  const input = document.getElementById('save-project-name-input');
  input.value = currentProjectName || state.brandName || '';
  const actions = document.getElementById('save-project-modal-actions');
  actions.innerHTML = currentProjectId
    ? `<button onclick="confirmSaveProject(true)" class="btn-secondary-sf flex-1 py-2 text-xs">Save as New</button>
       <button onclick="confirmSaveProject(false)" class="btn-primary-sf flex-1 py-2 text-xs">Update</button>`
    : `<button onclick="confirmSaveProject(false)" class="btn-primary-sf flex-1 py-2 text-xs">Save</button>`;
  document.getElementById('save-project-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 0);
}

function closeSaveProjectModal() {
  document.getElementById('save-project-modal').classList.add('hidden');
}

async function confirmSaveProject(asNew) {
  readStaticFields();
  snapshotPersonaView();
  const input = document.getElementById('save-project-name-input');
  const name = input.value.trim() || state.brandName || 'Untitled Profile';
  const id = asNew ? null : currentProjectId;
  try {
    const project = await SaasyAuth.saveProject({ tool: SAASY_TOOL, name, payload: state, id });
    currentProjectId = project.id;
    currentProjectName = project.name;
    closeSaveProjectModal();
    const s = document.getElementById('save-project-success');
    s.classList.remove('hidden');
    setTimeout(() => s.classList.add('hidden'), 2200);
  } catch (e) {
    alert('Could not save project: ' + e.message);
  }
}

async function openMyProjects() {
  if (!window.SaasyAuth) return;
  const panel = document.getElementById('my-projects-panel');
  if (!panel.classList.contains('hidden')) { closeMyProjects(); return; }
  if (!SaasyAuth.isSignedIn()) {
    try { await SaasyAuth.signIn(); syncAuthUI(); } catch (e) { return; }
  }
  panel.classList.remove('hidden');
  const list = document.getElementById('my-projects-list');
  list.innerHTML = '<div class="px-4 py-4 text-xs text-gray-400">Loading…</div>';
  try {
    const projects = await SaasyAuth.listProjects({ tool: SAASY_TOOL });
    if (!projects.length) {
      list.innerHTML = '<div class="px-4 py-4 text-xs text-gray-400">No saved projects yet.</div>';
      return;
    }
    list.innerHTML = '';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'px-4 py-3 flex items-center justify-between gap-2';
      row.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="text-sm font-600 text-gray-700 truncate">${escHTML(p.name)}</div>
          <div class="text-[11px] text-gray-400">${new Date(p.updated_at).toLocaleDateString()}</div>
        </div>
        <div class="flex gap-1 shrink-0">
          <button class="icon-btn" data-action="load">Load</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </div>`;
      row.querySelector('[data-action="load"]').onclick = () => loadProjectAndHydrate(p.id);
      row.querySelector('[data-action="delete"]').onclick = () => deleteProjectFromList(p.id, row);
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = '<div class="px-4 py-4 text-xs text-red-500">Failed to load projects.</div>';
  }
}

function closeMyProjects() {
  document.getElementById('my-projects-panel').classList.add('hidden');
}

async function deleteProjectFromList(id, row) {
  if (!confirm('Delete this saved project?')) return;
  try {
    await SaasyAuth.deleteProject(id);
    row.remove();
    if (id === currentProjectId) { currentProjectId = null; currentProjectName = null; }
  } catch (e) {
    alert('Could not delete project: ' + e.message);
  }
}

async function loadProjectAndHydrate(id) {
  try {
    const project = await SaasyAuth.loadProject(id);
    state = project.payload;
    currentProjectId = project.id;
    currentProjectName = project.name;
    document.getElementById('brand-industry').value = state._industry || 'recruiting';
    fillStaticFields();
    renderAll();
    refreshPreview();
    closeMyProjects();
    goToStep(0);
  } catch (e) {
    alert('Could not load project: ' + e.message);
  }
}

async function hydrateFromProjectId() {
  if (!window.SaasyAuth) return;
  const id = new URLSearchParams(window.location.search).get('projectId');
  if (!id) return;
  if (!SaasyAuth.isSignedIn()) {
    try { await SaasyAuth.signIn(); syncAuthUI(); } catch (e) { return; }
  }
  await loadProjectAndHydrate(id);
}

// ─── QUICK START (AI URL analysis) ──────────────────────────
function friendlyError(err) {
  // Compose a message from the code plus any upstream detail the Worker
  // passed through. This is far more useful than the bare `default_failed`
  // string the user sees when the shared backend has an issue.
  const code = err.code || '';
  const upstream = err.upstream ? ` upstream: ${err.upstream}` : '';
  const upstreamStatus = err.upstreamStatus ? ` (status ${err.upstreamStatus})` : '';
  const upstreamBody = err.upstreamBody ? ` — ${err.upstreamBody}` : '';

  const suggest = ' Try again in a moment, or open Advanced and paste your own Anthropic key (sk-ant-…) to bypass the shared backend.';

  const map = {
    missing_api_key: 'Add your API key in Advanced (sk-ant-… or sk-…), or clear it to use the shared default.',
    default_not_configured: `The shared backend isn't set up with an LLM key yet. Paste your own key in Advanced.`,
    default_rate_limited: `The shared backend is rate-limited (too many recent requests).${suggest}`,
    default_timeout: `The shared backend didn't respond within 45s.${suggest}`,
    default_unavailable: `Shared backend unavailable${upstream}${upstreamStatus}${upstreamBody}.${suggest}`,
    default_failed: `Shared backend call failed (HTTP ${err.status || '?'})${upstream}${upstreamStatus}${upstreamBody}.${suggest}`,
    default_network: `Can't reach the shared backend at ${err.endpoint || 'the default URL'}. Check your network, or paste your own key in Advanced.`,
    default_empty_response: `Shared backend returned no content.${suggest}`,
    anthropic_bad_key: 'Anthropic rejected the API key. Check it in the Anthropic Console.',
    anthropic_forbidden: `Your Anthropic key doesn't allow browser-access header calls to this model.`,
    anthropic_rate_limited: 'Anthropic rate-limited the request. Wait a moment and retry.',
    anthropic_overloaded: 'Anthropic is overloaded. Retry in a moment.',
    anthropic_empty_response: 'Anthropic returned no content. Retry or switch tiers.',
    sfgateway_bad_key: 'SF Gateway rejected the key.',
    sfgateway_forbidden: 'SF Gateway forbade the request.',
    sfgateway_rate_limited: 'SF Gateway rate-limited the request.',
    invalid_url: `That URL doesn't look right — include the domain (e.g. ncsasports.org).`
  };
  return map[code] || err.message || String(err);
}

// When the shared backend fails, auto-open Advanced so the user can drop
// in their own key without hunting for it.
function nudgeToAdvancedIfDefaultFailed(code) {
  if (!code || !code.startsWith('default_')) return;
  const panel = document.getElementById('quickstart-settings');
  if (panel && !panel.classList.contains('open')) panel.classList.add('open');
}

async function onQuickStartAnalyze() {
  const url = document.getElementById('quickstart-url').value.trim();
  readStaticFields();
  const strategy = getProfileStrategy();
  const errBox = document.getElementById('quickstart-error');
  if (strategy.lens === 'custom' && !strategy.customRole) {
    errBox.style.display = 'block';
    errBox.textContent = 'Add who will use this custom profile before analyzing.';
    document.getElementById('strategy-custom-role')?.focus();
    return;
  }
  if (!url) return;
  const btn = document.getElementById('quickstart-btn');
  const status = document.getElementById('quickstart-status');
  errBox.style.display = 'none';
  errBox.textContent = '';
  btn.disabled = true;
  status.innerHTML = '<div class="spinner"></div> Starting…';

  const setStatus = (label) => { status.innerHTML = `<div class="spinner"></div> ${label}`; };

  try {
    if (!window.LocalAI) throw new Error('LocalAI module not loaded');
    const ai = await window.LocalAI.analyzeCustomerURL(url, {
      profileType: state.profileType || 'b2c',
      strategy: Object.assign({}, getProfileStrategy()),
      onStatus: (phase) => {
        if (phase === 'fetching') setStatus('Fetching customer page…');
        else if (phase === 'fallback_url_only') setStatus('Site blocked scrape — analyzing from URL only…');
        else if (phase === 'analyzing') setStatus('Analyzing with Claude…');
        else if (phase === 'generating_images') setStatus('Creating on-brand profile imagery…');
      }
    });
    applyAIProfile(ai);
    const kind = isB2B() ? 'account profile' : 'individual profile';
    status.textContent = `✓ Applied ${INDUSTRY_DEFAULTS[state._industry].label} ${kind} from ${new URL(url.startsWith('http') ? url : 'https://' + url).hostname}`;
  } catch (e) {
    errBox.style.display = 'block';
    errBox.textContent = friendlyError(e);
    nudgeToAdvancedIfDefaultFailed(e.code);
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

function toggleQuickStartSettings() {
  document.getElementById('quickstart-settings').classList.toggle('open');
}

function refreshProviderBadge() {
  if (!window.LocalAI) return;
  const badge = document.getElementById('quickstart-mode-badge');
  const note = document.getElementById('quickstart-note');
  if (!badge || !note) return;
  const p = window.LocalAI.currentProvider();
  badge.classList.remove('byok');
  if (p === 'default') {
    badge.textContent = 'Default backend';
    note.innerHTML = 'Works out of the box — routes through a shared backend that holds the LLM API key. Open <b>Advanced</b> to use your own key or Worker.';
  } else if (p === 'anthropic') {
    badge.textContent = 'Your Anthropic key';
    badge.classList.add('byok');
    note.innerHTML = 'Using your own Anthropic key from Advanced. Clear it to switch back to the default backend.';
  } else if (p === 'sfgateway') {
    badge.textContent = 'Your SF LLM Gateway key';
    badge.classList.add('byok');
    note.innerHTML = 'Using your own SF LLM Gateway key. Clear it to switch back to the default backend.';
  }
}

function onLocalAIKeyChange() {
  const v = document.getElementById('quickstart-api-key').value;
  if (window.LocalAI) window.LocalAI.setKey(v);
  refreshProviderBadge();
}
function clearLocalAIKey() {
  document.getElementById('quickstart-api-key').value = '';
  if (window.LocalAI) window.LocalAI.setKey('');
  refreshProviderBadge();
}
function onScraperEndpointChange() {
  const v = document.getElementById('quickstart-scraper-url').value;
  if (window.LocalAI) window.LocalAI.setScraperEndpoint(v);
}

// ─── INIT ───────────────────────────────────────────────────
function bootstrap() {
  state._industry = state._industry || 'generic';
  applyPersonaPreset();
  applyPersonaSampleTemplate();
  snapshotPersonaView();
  fillStaticFields();
  renderAll();
  if (typeof hydrateBundledStarterImages === 'function') {
    hydrateBundledStarterImages(state).then(() => refreshPreview());
  }

  attachDropZone('drop-logo', 'preview-logo', (dataUrl) => {
    state.logo = dataUrl;
    document.getElementById('url-logo').value = '';
    refreshPreview();
  });
  attachDropZone('drop-user-avatar', 'preview-user-avatar', (dataUrl) => {
    state.userAvatar = dataUrl;
    document.getElementById('url-user-avatar').value = '';
    refreshPreview();
  });
  attachDropZone('drop-photo', 'preview-photo', (dataUrl) => {
    state.profile.photo = dataUrl;
    document.getElementById('url-photo').value = '';
    refreshPreview();
  });

  // Section icon uploaders — write the data URL into the text input so the
  // user can still see (and clear) what's set.
  ['preferences', 'events', 'membership'].forEach(key => {
    attachDropZone(`drop-${key}-icon`, null, (dataUrl) => {
      state[key].icon = dataUrl;
      document.getElementById(`${key}-icon`).value = dataUrl;
      refreshPreview();
    });
  });

  // Load persisted API key / scraper endpoint if any
  if (window.LocalAI) {
    const k = window.LocalAI.getKey();
    if (k) document.getElementById('quickstart-api-key').value = k;
    if (window.LocalAI.hasCustomScraperEndpoint()) {
      document.getElementById('quickstart-scraper-url').value = window.LocalAI.getScraperEndpoint();
    }
    refreshProviderBadge();
  }

  refreshPreview();
  fitPreviewScale();
  // Rescale after images/webfonts settle so the iframe's transform stays crisp
  requestAnimationFrame(fitPreviewScale);
  setTimeout(fitPreviewScale, 400);

  syncAuthUI();
  hydrateFromProjectId();
}

// Script may load before or after DOMContentLoaded (index.html injects
// script tags dynamically). Bootstrap in either case.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
