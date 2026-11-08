use spacetimedb::{table, reducer, ReducerContext, Table};

// -----------------------------------------------------------------------------
// 1. TABLES (Matching Hackathon Whiteboard Spec)
// -----------------------------------------------------------------------------

#[table(accessor = customers, public)]
pub struct Customer {
    #[primary_key]
    pub id: u64,
    pub string_id: String,           // e.g., "cust-1"
    pub name: String,
    pub age: u32,
    pub lives_alone: bool,
    pub language: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub avatar_url: String,
    pub known_vulnerabilities: String,
    pub weather_alert_title: String,
    pub weather_alert_severity: String,
    pub status: String,              // "pending", "calling", "completed"
}

#[table(accessor = policies, public)]
pub struct Policy {
    #[primary_key]
    pub policy_id: u64,
    pub customer_id: u64,
    pub policy_number: String,
    pub policy_type: String,
    pub coverage_limit: f64,
    pub deductible: f64,
}

#[table(accessor = active_calls, public)]
pub struct ActiveCall {
    #[primary_key]
    pub id: u64,
    pub customer_id: u64,
    pub live_transcript: String,
    pub status: String,              // "talking_ai", "agent_joined", "completed"
}

#[table(accessor = triage_queue, public)]
pub struct TriageQueue {
    #[primary_key]
    pub ticket_id: u64,
    pub customer_id: u64,
    pub priority_score: u32,         // 0 to 100 evaluated by Nemotron
    pub category: String,
    pub summary_reason: String,
    pub detected_hazard: String,
    pub status: String,
}

#[table(accessor = claims, public)]
pub struct Claim {
    #[primary_key]
    pub id: u64,
    pub customer_id: u64,
    pub policy_id: u64,
    pub description: String,
    pub hazard_type: String,
    pub est_payout: f64,
    pub customer_approved: bool,     // Verbal consent detected by Nemotron
    pub agent_approved: bool,        // 1-click button on Agent Dashboard
    pub claim_number: String,
    pub status: String,              // "DRAFT", "PENDING_AGENT_SUBMIT", "SUBMITTED"
}

// -----------------------------------------------------------------------------
// 2. INITIALIZATION / SEED REDUCER (Pre-Disaster Baseline)
// -----------------------------------------------------------------------------

#[reducer(init)]
pub fn init_simulation(ctx: &ReducerContext) {
    // 1. Sofia Martinez
    ctx.db.customers().insert(Customer {
        id: 1,
        string_id: "cust-1".to_string(),
        name: "Sofia Martinez".to_string(),
        age: 82,
        lives_alone: true,
        language: "es".to_string(),
        phone: "(555) 342-8910".to_string(),
        email: "sofia.martinez@example.com".to_string(),
        address: "742 Evergreen Terrace".to_string(),
        city: "Dallas".to_string(),
        state: "TX".to_string(),
        zip: "75201".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "82 years old, lives alone, sub-zero freeze vulnerability".to_string(),
        weather_alert_title: "Winter Freeze Advisory".to_string(),
        weather_alert_severity: "High".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 1,
        customer_id: 1,
        policy_number: "SF-89214-HO".to_string(),
        policy_type: "Homeowners Comprehensive (HO-3)".to_string(),
        coverage_limit: 350000.0,
        deductible: 1000.0,
    });

    // 2. Liam Carter
    ctx.db.customers().insert(Customer {
        id: 2,
        string_id: "cust-2".to_string(),
        name: "Liam Carter".to_string(),
        age: 23,
        lives_alone: true,
        language: "en".to_string(),
        phone: "(555) 789-0123".to_string(),
        email: "liam.carter@example.com".to_string(),
        address: "108 College Ave, Apt B".to_string(),
        city: "Fort Worth".to_string(),
        state: "TX".to_string(),
        zip: "76102".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "Ground-floor basement apartment, prone to water pooling".to_string(),
        weather_alert_title: "Flash Flood Watch".to_string(),
        weather_alert_severity: "High".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 2,
        customer_id: 2,
        policy_number: "SF-44120-RT".to_string(),
        policy_type: "Renters Comprehensive".to_string(),
        coverage_limit: 40000.0,
        deductible: 500.0,
    });

    // 3. Eleanor Vance
    ctx.db.customers().insert(Customer {
        id: 3,
        string_id: "cust-3".to_string(),
        name: "Eleanor Vance".to_string(),
        age: 76,
        lives_alone: true,
        language: "en".to_string(),
        phone: "(555) 432-1098".to_string(),
        email: "eleanor.vance@example.com".to_string(),
        address: "450 Oakridge Lane".to_string(),
        city: "Arlington".to_string(),
        state: "TX".to_string(),
        zip: "76010".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "76 years old, lives alone, large overhanging oak tree".to_string(),
        weather_alert_title: "High Wind Advisory".to_string(),
        weather_alert_severity: "Medium".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 3,
        customer_id: 3,
        policy_number: "SF-33109-HO".to_string(),
        policy_type: "Homeowners Elite (HO-5)".to_string(),
        coverage_limit: 500000.0,
        deductible: 1500.0,
    });

    // 4. Marcus & Elena Brody
    ctx.db.customers().insert(Customer {
        id: 4,
        string_id: "cust-4".to_string(),
        name: "Marcus & Elena Brody".to_string(),
        age: 45,
        lives_alone: false,
        language: "en".to_string(),
        phone: "(555) 612-3489".to_string(),
        email: "brody.family@example.com".to_string(),
        address: "1290 Whispering Pines Dr".to_string(),
        city: "Plano".to_string(),
        state: "TX".to_string(),
        zip: "75023".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "Multiple exterior vehicles, high hail exposure".to_string(),
        weather_alert_title: "Severe Hailstorm Warning".to_string(),
        weather_alert_severity: "Medium".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 4,
        customer_id: 4,
        policy_number: "SF-67823-HO".to_string(),
        policy_type: "Homeowners Comprehensive".to_string(),
        coverage_limit: 450000.0,
        deductible: 1000.0,
    });

    // 5. Chloe Zhang
    ctx.db.customers().insert(Customer {
        id: 5,
        string_id: "cust-5".to_string(),
        name: "Chloe Zhang".to_string(),
        age: 31,
        lives_alone: false,
        language: "en".to_string(),
        phone: "(555) 246-8101".to_string(),
        email: "chloe.zhang@example.com".to_string(),
        address: "88 McKinney Ave, Unit 402".to_string(),
        city: "Dallas".to_string(),
        state: "TX".to_string(),
        zip: "75204".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "None (Standard 4th-floor unit)".to_string(),
        weather_alert_title: "Normal Weather Conditions".to_string(),
        weather_alert_severity: "Low".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 5,
        customer_id: 5,
        policy_number: "SF-99210-AU".to_string(),
        policy_type: "Auto & Renters Bundle".to_string(),
        coverage_limit: 100000.0,
        deductible: 500.0,
    });

    // 6. Arthur Pendelton
    ctx.db.customers().insert(Customer {
        id: 6,
        string_id: "cust-6".to_string(),
        name: "Arthur Pendelton".to_string(),
        age: 88,
        lives_alone: true,
        language: "en".to_string(),
        phone: "(555) 918-2736".to_string(),
        email: "arthur.pendelton@example.com".to_string(),
        address: "2210 Sun Valley Rd".to_string(),
        city: "Richardson".to_string(),
        state: "TX".to_string(),
        zip: "75080".to_string(),
        avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80".to_string(),
        known_vulnerabilities: "88 years old, lives alone, extreme heat vulnerability".to_string(),
        weather_alert_title: "Extreme Heat Advisory".to_string(),
        weather_alert_severity: "High".to_string(),
        status: "pending".to_string(),
    });

    ctx.db.policies().insert(Policy {
        policy_id: 6,
        customer_id: 6,
        policy_number: "SF-11029-HO".to_string(),
        policy_type: "Homeowners Senior Care".to_string(),
        coverage_limit: 300000.0,
        deductible: 500.0,
    });
}

// -----------------------------------------------------------------------------
// 3. REDUCERS
// -----------------------------------------------------------------------------

#[reducer]
pub fn update_call_transcript(
    ctx: &ReducerContext,
    call_id: u64,
    customer_id: u64,
    transcript_chunk: String,
) {
    if let Some(mut call) = ctx.db.active_calls().id().find(call_id) {
        call.live_transcript.push_str(" ");
        call.live_transcript.push_str(&transcript_chunk);
        ctx.db.active_calls().id().update(call);
    } else {
        ctx.db.active_calls().insert(ActiveCall {
            id: call_id,
            customer_id,
            live_transcript: transcript_chunk,
            status: "talking_ai".to_string(),
        });
    }
}

#[reducer]
pub fn update_triage_score(
    ctx: &ReducerContext,
    ticket_id: u64,
    customer_id: u64,
    priority_score: u32,
    category: String,
    summary_reason: String,
    detected_hazard: String,
) {
    if let Some(mut ticket) = ctx.db.triage_queue().ticket_id().find(ticket_id) {
        ticket.priority_score = priority_score;
        ticket.category = category;
        ticket.summary_reason = summary_reason;
        ticket.detected_hazard = detected_hazard;
        ctx.db.triage_queue().ticket_id().update(ticket);
    } else {
        ctx.db.triage_queue().insert(TriageQueue {
            ticket_id,
            customer_id,
            priority_score,
            category,
            summary_reason,
            detected_hazard,
            status: "AI_ACTIVE".to_string(),
        });
    }
}

#[reducer]
pub fn create_or_update_claim(
    ctx: &ReducerContext,
    claim_id: u64,
    customer_id: u64,
    policy_id: u64,
    description: String,
    hazard_type: String,
    est_payout: f64,
    customer_approved: bool,
) {
    let status = if customer_approved {
        "PENDING_AGENT_SUBMIT".to_string()
    } else {
        "DRAFT".to_string()
    };

    if let Some(mut claim) = ctx.db.claims().id().find(claim_id) {
        claim.description = description;
        claim.hazard_type = hazard_type;
        claim.est_payout = est_payout;
        claim.customer_approved = customer_approved;
        claim.status = status;
        ctx.db.claims().id().update(claim);
    } else {
        ctx.db.claims().insert(Claim {
            id: claim_id,
            customer_id,
            policy_id,
            description,
            hazard_type,
            est_payout,
            customer_approved,
            agent_approved: false,
            claim_number: "".to_string(),
            status,
        });
    }
}

#[reducer]
pub fn agent_approve_claim(
    ctx: &ReducerContext,
    claim_id: u64,
    claim_number: String,
) {
    if let Some(mut claim) = ctx.db.claims().id().find(claim_id) {
        if claim.customer_approved {
            claim.agent_approved = true;
            claim.claim_number = claim_number;
            claim.status = "SUBMITTED".to_string();
            ctx.db.claims().id().update(claim);
        }
    }
}