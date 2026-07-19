// ============================================================
// defaults.js — Industry defaults for Unified Profile Generator
// ============================================================
// Each industry defines the full shape of a Customer 360 / Data
// Cloud unified profile: profile card fields, insight labels,
// affinity categories, Einstein recommendations, engagement feed.
// The wizard swaps between these when the user picks an industry
// (or when AI URL analysis auto-detects one).
// ============================================================

const INDUSTRY_DEFAULTS = {
  recruiting: {
    label: 'Sports Recruiting / Education',
    colors: { primary: '#001E5B', accent: '#066AFE', secondary: '#EAF5FE', menu: '#FFFFFF', menuText: '#3E3E3C' },
    appName: 'Data Cloud',
    navLinks: ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Lake Objects', 'Data Model', 'Identity Resolutions', 'Calculated Insights'],
    tabName: 'Joey Vutto',
    profile: {
      name: 'Joey Vutto',
      city: 'Chicago, IL',
      customerId: '02567418',
      email: 'joey.vutto@gmail.com',
      secondaryEmail: 'mama.v@gmail.com',
      secondaryEmailLabel: "Parent's Email",
      secondaryEmailInclude: true,
      phone: '(312) 545-1254',
      address: '12345 Main Avenue\nChicago, IL 30242',
      segment: 'Website Visit- Last 24 hrs, Sophomore, Baseball affinity, Camp affinity, IMG interest',
      photo: ''
    },
    loyalty: {
      title: 'Loyalty Insights',
      memberId: '365895',
      tier: 'Benchmarker',
      points: '5432',
      redeemedPoints: '500'
    },
    insights: {
      title: 'Athlete Insights',
      items: [
        { icon: '🛒', label: 'Lifetime Value', value: '$5,882.26 (Avg $2,438.50)' },
        { icon: '🎯', label: 'Propensity to Buy', value: 'Most Likely' },
        { icon: '📊', label: 'Engagement Score', value: '54% (Moderately Engaged)' },
        { icon: '📅', label: 'Time since last event', value: '9 months' },
        { icon: '📈', label: 'RFM Score', value: '61' },
        { icon: '💚', label: 'CSAT Score', value: '3.4 (Neutral)' }
      ]
    },
    affinities: {
      title: 'Affinities',
      seriesA: { label: 'Views', color: '#0B2447' },
      seriesB: { label: 'Interaction', color: '#066AFE' },
      groups: [
        { name: 'Brands', items: [
          { label: 'NCSA', a: 62, b: 78 },
          { label: 'IMG', a: 38, b: 44 }
        ]},
        { name: 'Demographic', items: [
          { label: 'Mens', a: 55, b: 68 },
          { label: 'Student', a: 60, b: 72 },
          { label: 'Sophomore', a: 48, b: 60 },
          { label: 'Baseball', a: 40, b: 30 }
        ]},
        { name: 'Services', items: [
          { label: 'Membership', a: 70, b: 82 },
          { label: 'Nutrition Coaching', a: 42, b: 50 },
          { label: 'Baseball Camps', a: 58, b: 66 }
        ]},
        { name: 'Content Affinity', items: [
          { label: 'Scholarships', a: 68, b: 76 },
          { label: 'D1', a: 55, b: 64 },
          { label: 'Coach Contact', a: 45, b: 52 },
          { label: 'IMG Camp', a: 38, b: 44 }
        ]}
      ]
    },
    preferences: {
      title: 'Athlete Preferences',
      items: [
        { label: 'Allergies', value: 'Peanut allergy' },
        { label: 'Dietary Restrictions', value: 'Pescatarian' },
        { label: 'Availability', value: 'Only call/text between 5-8pm CST' },
        { label: 'Birthday', value: 'April 15' }
      ]
    },
    events: {
      title: 'Events (All Brands)',
      items: [
        { name: 'Nike Winter Clinic', date: '4/22/22 - 4/30/22', confirmation: '#19478YJN' },
        { name: 'Coastal Carolina Clinic', date: '3/14/23 - 3/20/23', confirmation: '# 238173' }
      ]
    },
    membership: {
      title: 'NCSA Membership Details',
      items: [
        { label: 'Member ID', value: '365895' },
        { label: 'Member Type', value: 'MVP Membership' }
      ]
    },
    recommendations: {
      title: 'Einstein Recommendations',
      items: [
        {
          eyebrow: 'Next Best Action:',
          title: 'Schedule Consult with Recruiting Coordinator',
          cta: 'Suggest',
          image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&auto=format&fit=crop&q=80'
        },
        {
          eyebrow: 'Recommended:',
          title: 'IMG On-Campus Baseball Camp',
          cta: 'Suggest',
          image: 'https://images.unsplash.com/photo-1508344928-9b21b3f0a09e?w=800&auto=format&fit=crop&q=80'
        }
      ]
    },
    activity: {
      title: 'Engagement Activity',
      items: [
        { icon: '🎯', title: 'Added to Segment', body: 'Added <b>High Propensity for IMG Baseball Camp</b>', time: '1 hr ago' },
        { icon: '⚛️', title: 'Lifetime Value Increase', body: '<span style="color:#066AFE">17%</span> Increase', time: '1 hr ago' },
        { icon: '💖', title: 'Loyalty Account Enabled', body: '<b>Benchmarker</b> Loyalty Status Achieved', time: '17 days ago' },
        { icon: '🛒', title: 'NCSA Membership Purchased', body: '<b>$109</b> Purchased', time: '17 days ago' }
      ]
    }
  },

  retail: {
    label: 'Retail / Fashion',
    colors: { primary: '#111827', accent: '#EC4899', secondary: '#FDF2F8', menu: '#FFFFFF', menuText: '#3E3E3C' },
    appName: 'Data Cloud',
    navLinks: ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Model', 'Identity Resolutions', 'Calculated Insights'],
    tabName: 'Sarah Chen',
    profile: {
      name: 'Sarah Chen',
      city: 'San Francisco, CA',
      customerId: '98432156',
      email: 'sarah.chen@gmail.com',
      secondaryEmail: '',
      secondaryEmailLabel: 'Secondary Email',
      secondaryEmailInclude: false,
      phone: '(415) 555-2287',
      address: '512 Divisadero Street\nSan Francisco, CA 94117',
      segment: 'Cart Abandoners- 7 days, VIP Tier, Womens, High LTV, Fall Collection interest',
      photo: ''
    },
    loyalty: {
      title: 'Loyalty Insights',
      memberId: '441203',
      tier: 'Platinum',
      points: '12,840',
      redeemedPoints: '3,200'
    },
    insights: {
      title: 'Shopper Insights',
      items: [
        { icon: '🛒', label: 'Lifetime Value', value: '$18,442.10 (Avg $312.75)' },
        { icon: '🎯', label: 'Propensity to Buy', value: 'Most Likely' },
        { icon: '📊', label: 'Engagement Score', value: '82% (Highly Engaged)' },
        { icon: '📅', label: 'Time since last purchase', value: '4 days' },
        { icon: '📈', label: 'RFM Score', value: '89' },
        { icon: '💚', label: 'CSAT Score', value: '4.6 (Satisfied)' }
      ]
    },
    affinities: {
      title: 'Affinities',
      seriesA: { label: 'Browse', color: '#111827' },
      seriesB: { label: 'Purchase', color: '#EC4899' },
      groups: [
        { name: 'Brands', items: [
          { label: 'Everlane', a: 72, b: 68 },
          { label: 'Reformation', a: 66, b: 54 },
          { label: 'Madewell', a: 48, b: 40 }
        ]},
        { name: 'Category', items: [
          { label: 'Womens', a: 88, b: 82 },
          { label: 'Dresses', a: 70, b: 66 },
          { label: 'Denim', a: 55, b: 48 },
          { label: 'Accessories', a: 42, b: 30 }
        ]},
        { name: 'Occasion', items: [
          { label: 'Work', a: 60, b: 55 },
          { label: 'Weekend', a: 78, b: 70 },
          { label: 'Evening', a: 45, b: 38 }
        ]},
        { name: 'Content Affinity', items: [
          { label: 'New Arrivals', a: 82, b: 74 },
          { label: 'Sale', a: 68, b: 60 },
          { label: 'Style Guides', a: 52, b: 40 }
        ]}
      ]
    },
    preferences: {
      title: 'Customer Preferences',
      items: [
        { label: 'Sizes', value: 'W: 6, D: 27, Shoe: 8' },
        { label: 'Fit Preferences', value: 'Petite, cropped' },
        { label: 'Communication', value: 'Email — no SMS' },
        { label: 'Birthday', value: 'August 22' }
      ]
    },
    events: {
      title: 'Events (All Brands)',
      items: [
        { name: 'Fall Preview Event', date: '9/12/25 - 9/14/25', confirmation: '#RTL-8842' },
        { name: 'VIP Sample Sale', date: '6/03/25 - 6/05/25', confirmation: '# 552081' }
      ]
    },
    membership: {
      title: 'Membership Details',
      items: [
        { label: 'Member ID', value: '441203' },
        { label: 'Member Type', value: 'Platinum Tier' }
      ]
    },
    recommendations: {
      title: 'Einstein Recommendations',
      items: [
        {
          eyebrow: 'Next Best Action:',
          title: 'Send abandoned cart reminder with 10% off',
          cta: 'Send',
          image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&auto=format&fit=crop&q=80'
        },
        {
          eyebrow: 'Recommended:',
          title: 'Fall Collection Curated Edit',
          cta: 'Suggest',
          image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'
        }
      ]
    },
    activity: {
      title: 'Engagement Activity',
      items: [
        { icon: '🎯', title: 'Added to Segment', body: 'Added <b>Cart Abandoners - 7 days</b>', time: '2 hr ago' },
        { icon: '⚛️', title: 'Lifetime Value Increase', body: '<span style="color:#EC4899">24%</span> Increase', time: '3 days ago' },
        { icon: '💖', title: 'Loyalty Account Enabled', body: '<b>Platinum</b> Tier Achieved', time: '30 days ago' },
        { icon: '🛒', title: 'Purchase Completed', body: '<b>$284</b> Purchased', time: '30 days ago' }
      ]
    }
  },

  healthcare: {
    label: 'Healthcare / Pharmacy',
    colors: { primary: '#065F46', accent: '#10B981', secondary: '#ECFDF5', menu: '#FFFFFF', menuText: '#3E3E3C' },
    appName: 'Data Cloud',
    navLinks: ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Model', 'Identity Resolutions', 'Calculated Insights'],
    tabName: 'Marcus Rivera',
    profile: {
      name: 'Marcus Rivera',
      city: 'Austin, TX',
      customerId: '77104582',
      email: 'marcus.r@gmail.com',
      secondaryEmail: '',
      secondaryEmailLabel: 'Secondary Email',
      secondaryEmailInclude: false,
      phone: '(512) 555-9081',
      address: '2201 East 6th Street\nAustin, TX 78702',
      segment: 'Rx Refill Due- 14 days, Preventive Care Enrolled, Chronic Care Program, Wellness Rewards Active',
      photo: ''
    },
    loyalty: {
      title: 'Wellness Rewards',
      memberId: '552019',
      tier: 'Gold',
      points: '8,120',
      redeemedPoints: '1,400'
    },
    insights: {
      title: 'Patient Insights',
      items: [
        { icon: '🛒', label: 'Lifetime Value', value: '$4,220.00 (Avg $88.50)' },
        { icon: '🎯', label: 'Adherence Score', value: 'High' },
        { icon: '📊', label: 'Engagement Score', value: '78% (Highly Engaged)' },
        { icon: '📅', label: 'Time since last visit', value: '2 months' },
        { icon: '📈', label: 'Risk Score', value: 'Low' },
        { icon: '💚', label: 'CSAT Score', value: '4.8 (Very Satisfied)' }
      ]
    },
    affinities: {
      title: 'Affinities',
      seriesA: { label: 'Interest', color: '#065F46' },
      seriesB: { label: 'Engagement', color: '#10B981' },
      groups: [
        { name: 'Services', items: [
          { label: 'Preventive Care', a: 72, b: 80 },
          { label: 'Pharmacy', a: 88, b: 82 },
          { label: 'Telehealth', a: 55, b: 62 }
        ]},
        { name: 'Conditions', items: [
          { label: 'Hypertension', a: 60, b: 68 },
          { label: 'Diabetes-2', a: 42, b: 48 }
        ]},
        { name: 'Content Affinity', items: [
          { label: 'Nutrition', a: 70, b: 66 },
          { label: 'Exercise', a: 62, b: 58 },
          { label: 'Sleep', a: 48, b: 40 }
        ]},
        { name: 'Wellness Programs', items: [
          { label: 'Steps Challenge', a: 78, b: 82 },
          { label: 'Meditation', a: 40, b: 52 }
        ]}
      ]
    },
    preferences: {
      title: 'Patient Preferences',
      items: [
        { label: 'Allergies', value: 'Sulfa drugs' },
        { label: 'Language', value: 'English, Spanish' },
        { label: 'Communication', value: 'Text preferred, no calls after 8pm' },
        { label: 'Birthday', value: 'March 3' }
      ]
    },
    events: {
      title: 'Recent Visits',
      items: [
        { name: 'Annual Physical', date: '5/12/25', confirmation: '#HC-88221' },
        { name: 'Diabetes Coaching', date: '4/02/25 - 4/16/25', confirmation: '# 552019-DC' }
      ]
    },
    membership: {
      title: 'Health Plan Details',
      items: [
        { label: 'Plan ID', value: '552019' },
        { label: 'Plan Type', value: 'Gold PPO' }
      ]
    },
    recommendations: {
      title: 'Einstein Recommendations',
      items: [
        {
          eyebrow: 'Next Best Action:',
          title: 'Schedule Annual Wellness Visit',
          cta: 'Book',
          image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80'
        },
        {
          eyebrow: 'Recommended:',
          title: 'Enroll in Nutrition Coaching Program',
          cta: 'Enroll',
          image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&auto=format&fit=crop&q=80'
        }
      ]
    },
    activity: {
      title: 'Engagement Activity',
      items: [
        { icon: '🎯', title: 'Added to Segment', body: 'Added <b>Rx Refill Due - 14 days</b>', time: '4 hr ago' },
        { icon: '⚛️', title: 'Adherence Improved', body: '<span style="color:#10B981">12%</span> Increase', time: '1 week ago' },
        { icon: '💖', title: 'Wellness Rewards Enabled', body: '<b>Gold</b> Tier Achieved', time: '22 days ago' },
        { icon: '🛒', title: 'Rx Refilled', body: '<b>$18</b> Copay', time: '22 days ago' }
      ]
    }
  },

  financial: {
    label: 'Financial Services',
    colors: { primary: '#0F172A', accent: '#7C3AED', secondary: '#F5F3FF', menu: '#FFFFFF', menuText: '#3E3E3C' },
    appName: 'Data Cloud',
    navLinks: ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Model', 'Identity Resolutions', 'Calculated Insights'],
    tabName: 'Priya Shah',
    profile: {
      name: 'Priya Shah',
      city: 'New York, NY',
      customerId: '20194557',
      email: 'p.shah@outlook.com',
      secondaryEmail: '',
      secondaryEmailLabel: 'Secondary Email',
      secondaryEmailInclude: false,
      phone: '(212) 555-4471',
      address: '88 W 22nd Street\nNew York, NY 10011',
      segment: 'Wealth Management Prospect, HNW, Mortgage Renewal- 90 days, Investment Advisory interest',
      photo: ''
    },
    loyalty: {
      title: 'Relationship Insights',
      memberId: '772044',
      tier: 'Private Client',
      points: '—',
      redeemedPoints: '—'
    },
    insights: {
      title: 'Client Insights',
      items: [
        { icon: '🛒', label: 'Assets Under Management', value: '$1.42M' },
        { icon: '🎯', label: 'Cross-sell Propensity', value: 'Most Likely' },
        { icon: '📊', label: 'Engagement Score', value: '71% (Engaged)' },
        { icon: '📅', label: 'Time since last advisor call', value: '3 months' },
        { icon: '📈', label: 'Wallet Share', value: '48%' },
        { icon: '💚', label: 'NPS Score', value: '9 (Promoter)' }
      ]
    },
    affinities: {
      title: 'Affinities',
      seriesA: { label: 'Research', color: '#0F172A' },
      seriesB: { label: 'Transactions', color: '#7C3AED' },
      groups: [
        { name: 'Products', items: [
          { label: 'Investing', a: 78, b: 72 },
          { label: 'Mortgage', a: 62, b: 44 },
          { label: 'Credit Card', a: 40, b: 55 }
        ]},
        { name: 'Segments', items: [
          { label: 'HNW', a: 82, b: 78 },
          { label: 'Digital-First', a: 66, b: 70 }
        ]},
        { name: 'Content Affinity', items: [
          { label: 'Market Research', a: 74, b: 62 },
          { label: 'Retirement Planning', a: 58, b: 44 },
          { label: 'ESG Investing', a: 42, b: 30 }
        ]},
        { name: 'Channels', items: [
          { label: 'Mobile App', a: 85, b: 82 },
          { label: 'Advisor Portal', a: 55, b: 60 }
        ]}
      ]
    },
    preferences: {
      title: 'Client Preferences',
      items: [
        { label: 'Risk Tolerance', value: 'Moderate-Aggressive' },
        { label: 'Communication', value: 'Advisor call quarterly' },
        { label: 'Statements', value: 'Digital only' },
        { label: 'Birthday', value: 'November 8' }
      ]
    },
    events: {
      title: 'Recent Interactions',
      items: [
        { name: 'Wealth Review Q2', date: '6/18/25', confirmation: '#WM-44712' },
        { name: 'Mortgage Consult', date: '2/04/25', confirmation: '# 20194557-M' }
      ]
    },
    membership: {
      title: 'Relationship Details',
      items: [
        { label: 'Client ID', value: '772044' },
        { label: 'Relationship', value: 'Private Client' }
      ]
    },
    recommendations: {
      title: 'Einstein Recommendations',
      items: [
        {
          eyebrow: 'Next Best Action:',
          title: 'Schedule Q3 Portfolio Review',
          cta: 'Schedule',
          image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80'
        },
        {
          eyebrow: 'Recommended:',
          title: 'Introduce ESG Fund Product',
          cta: 'Suggest',
          image: 'https://images.unsplash.com/photo-1556155092-490a1ba16284?w=800&auto=format&fit=crop&q=80'
        }
      ]
    },
    activity: {
      title: 'Engagement Activity',
      items: [
        { icon: '🎯', title: 'Added to Segment', body: 'Added <b>Wealth Management Prospect</b>', time: '2 hr ago' },
        { icon: '⚛️', title: 'AUM Growth', body: '<span style="color:#7C3AED">8%</span> Increase', time: '1 week ago' },
        { icon: '💖', title: 'Tier Upgrade', body: '<b>Private Client</b> Achieved', time: '2 months ago' },
        { icon: '🛒', title: 'Advisory Fee', body: '<b>$1,240</b> Q2 Fee', time: '2 months ago' }
      ]
    }
  },

  generic: {
    label: 'Generic',
    colors: { primary: '#1F2937', accent: '#3B82F6', secondary: '#F1F5F9', menu: '#FFFFFF', menuText: '#3E3E3C' },
    appName: 'Data Cloud',
    navLinks: ['Home', 'Data Streams', 'Segments', 'Activations', 'Data Model', 'Identity Resolutions', 'Calculated Insights'],
    tabName: 'Alex Morgan',
    profile: {
      name: 'Alex Morgan',
      city: 'Chicago, IL',
      customerId: '01234567',
      email: 'alex.morgan@gmail.com',
      secondaryEmail: '',
      secondaryEmailLabel: 'Secondary Email',
      secondaryEmailInclude: false,
      phone: '(312) 555-0100',
      address: '123 Main Street\nChicago, IL 60601',
      segment: 'Recent Website Visit, Newsletter Subscriber, Product Interest',
      photo: ''
    },
    loyalty: {
      title: 'Loyalty Insights',
      memberId: '100001',
      tier: 'Silver',
      points: '2,400',
      redeemedPoints: '300'
    },
    insights: {
      title: 'Customer Insights',
      items: [
        { icon: '🛒', label: 'Lifetime Value', value: '$1,240.00 (Avg $155.00)' },
        { icon: '🎯', label: 'Propensity to Buy', value: 'Likely' },
        { icon: '📊', label: 'Engagement Score', value: '65% (Engaged)' },
        { icon: '📅', label: 'Time since last event', value: '3 weeks' },
        { icon: '📈', label: 'RFM Score', value: '72' },
        { icon: '💚', label: 'CSAT Score', value: '4.2 (Satisfied)' }
      ]
    },
    affinities: {
      title: 'Affinities',
      seriesA: { label: 'Views', color: '#1F2937' },
      seriesB: { label: 'Interaction', color: '#3B82F6' },
      groups: [
        { name: 'Brands', items: [
          { label: 'Brand A', a: 60, b: 70 },
          { label: 'Brand B', a: 40, b: 50 }
        ]},
        { name: 'Demographic', items: [
          { label: 'Adult', a: 65, b: 72 },
          { label: 'Urban', a: 50, b: 58 }
        ]},
        { name: 'Services', items: [
          { label: 'Subscription', a: 68, b: 74 },
          { label: 'Add-ons', a: 42, b: 48 }
        ]},
        { name: 'Content Affinity', items: [
          { label: 'Product', a: 70, b: 66 },
          { label: 'Support', a: 45, b: 52 }
        ]}
      ]
    },
    preferences: {
      title: 'Customer Preferences',
      items: [
        { label: 'Communication', value: 'Email' },
        { label: 'Notifications', value: 'Weekly digest' },
        { label: 'Language', value: 'English' },
        { label: 'Birthday', value: 'June 12' }
      ]
    },
    events: {
      title: 'Recent Events',
      items: [
        { name: 'Product Webinar', date: '5/15/25', confirmation: '#WB-1001' }
      ]
    },
    membership: {
      title: 'Membership Details',
      items: [
        { label: 'Member ID', value: '100001' },
        { label: 'Member Type', value: 'Silver' }
      ]
    },
    recommendations: {
      title: 'Einstein Recommendations',
      items: [
        {
          eyebrow: 'Next Best Action:',
          title: 'Send onboarding follow-up',
          cta: 'Send',
          image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&auto=format&fit=crop&q=80'
        },
        {
          eyebrow: 'Recommended:',
          title: 'Feature Discovery Email Sequence',
          cta: 'Suggest',
          image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=80'
        }
      ]
    },
    activity: {
      title: 'Engagement Activity',
      items: [
        { icon: '🎯', title: 'Added to Segment', body: 'Added <b>Product Interest</b>', time: '1 hr ago' },
        { icon: '⚛️', title: 'Engagement Increase', body: '<span style="color:#3B82F6">10%</span> Increase', time: '3 days ago' },
        { icon: '💖', title: 'Loyalty Enrolled', body: '<b>Silver</b> Tier Enrolled', time: '10 days ago' },
        { icon: '🛒', title: 'Order Placed', body: '<b>$88</b> Purchased', time: '10 days ago' }
      ]
    }
  }
};

// Helper: deep-clone an industry default so edits in the UI don't
// mutate the shared template.
function cloneIndustry(key) {
  const base = INDUSTRY_DEFAULTS[key] || INDUSTRY_DEFAULTS.generic;
  return JSON.parse(JSON.stringify(base));
}
