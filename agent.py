# Bell Canada Sales Assistant — AI Agent POC
# MMAI 891 | March 2026
# 
# Google ADK agent with 5 tools:
#   - GoogleSearchTool (sub-agent)
#   - UrlContextTool (sub-agent)  
#   - check_eligibility (FunctionTool)
#   - create_lead (FunctionTool)
#   - escalate_to_human (FunctionTool)
#
# Run: uvicorn agent_api:app --port 8000 --reload
# 
from dotenv import load_dotenv
load_dotenv(".env.local")

from google.adk.agents import LlmAgent
from google.adk.tools import agent_tool
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.adk.tools import url_context
from google.adk.tools import FunctionTool

sales_agent_for_bell_canada_telco_google_search_agent = LlmAgent(
    name='Sales_Agent_for_Bell_Canada_Telco_google_search_agent',
    model='gemini-2.5-pro',
    description='Agent specialized in performing Google searches.',
    sub_agents=[],
    instruction='Use the GoogleSearchTool to find information on the web.',
    tools=[
        GoogleSearchTool()
    ],
)

sales_agent_for_bell_canada_telco_url_context_agent = LlmAgent(
    name='Sales_Agent_for_Bell_Canada_Telco_url_context_agent',
    model='gemini-2.5-pro',
    description='Agent specialized in fetching content from URLs.',
    sub_agents=[],
    instruction='Use the UrlContextTool to retrieve content from provided URLs.',
    tools=[
        url_context
    ],
)

def check_eligibility(customer_type: str, service_type: str, postal_code: str = "") -> dict:
    """Check if a customer is eligible for a Bell service.
    
    Args:
        customer_type: 'new' or 'existing'
        service_type: 'mobility', 'internet', or 'bundle'
        postal_code: customer postal code if provided
    
    Returns:
        Eligibility result with available options
    """
    eligible_services = {
        "mobility": ["monthly", "prepaid", "bring_your_own_device"],
        "internet": ["fibe", "wimax"] if postal_code.upper().startswith("M") else ["fibe"],
        "bundle": ["mobility_internet", "mobility_tv_internet"]
    }
    return {
        "eligible": True,
        "customer_type": customer_type,
        "service_type": service_type,
        "available_options": eligible_services.get(service_type, []),
        "postal_code": postal_code or "not provided",
        "promo_eligible": customer_type == "new",
        "next_step": "present_offers"
    }

def create_lead(
    customer_type: str,
    service_type: str,
    selected_plan: str,
    contact_preference: str = "online"
) -> dict:
    """Create a sales lead record when customer selects a plan.
    
    Args:
        customer_type: 'new' or 'existing'
        service_type: type of service selected
        selected_plan: the plan the customer chose
        contact_preference: 'online', 'phone', or 'agent'
    
    Returns:
        Lead confirmation with reference number
    """
    import random, string
    lead_id = "BELL-" + "".join(random.choices(
        string.ascii_uppercase + string.digits, k=8
    ))
    return {
        "lead_id": lead_id,
        "status": "created",
        "customer_type": customer_type,
        "service_type": service_type,
        "selected_plan": selected_plan,
        "contact_preference": contact_preference,
        "next_step": "complete_online" if contact_preference == "online" else "agent_followup",
        "message": f"Your interest in {selected_plan} has been recorded. Reference: {lead_id}"
    }

def escalate_to_human(
    reason: str,
    customer_type: str = "",
    selected_plan: str = "",
    conversation_summary: str = ""
) -> dict:
    """Escalate conversation to a human Bell agent with full context.
    
    Args:
        reason: why escalation is needed
        customer_type: new or existing
        selected_plan: plan customer was interested in
        conversation_summary: brief summary of conversation so far
    
    Returns:
        Handoff confirmation with context for human agent
    """
    import random
    ticket_id = f"ESC-{random.randint(10000, 99999)}"
    return {
        "escalated": True,
        "ticket_id": ticket_id,
        "reason": reason,
        "context": {
            "customer_type": customer_type,
            "selected_plan": selected_plan,
            "summary": conversation_summary
        },
        "message": f"Connecting you with a Bell specialist now. Your reference number is {ticket_id}. They will have full context of our conversation."
    }

root_agent = LlmAgent(
    name='Sales_Agent_for_Bell_Canada_Telco',
    model='gemini-2.5-pro',
    description='I want a sales agent for the telco Bell',
    sub_agents=[],
    instruction='''If the customer's first message is a greeting (hi, hello, morning, hey, 
good morning, bonjour, etc.), do not ask "are you a new or existing 
customer?" again — you already asked this in your opening message. 
Instead wait for their response to that question.

I want the agent to help a customer when they're looking to get a new 
phone plan with Bell.

Always start by asking the user if they are a new or existing customer. 
If they are new, follow the path below:

- If customer is inquiring about getting a cell phone plan with Bell, 
  ask customer if they want a monthly plan or prepaid plan. If monthly, 
  display plan options available on this page: 
  https://www.bell.ca/Mobility/Cell_phone_plans?acnt=aal

- Always ask user for confirmation on which plan they want.

- Upon selecting a plan, ask user to go online on this page to continue 
  the sales flow: https://www.bell.ca/Mobility/Cell_phone_plans?acnt=aal

- If user comes in asking about getting home internet, ask user for 
  address, and confirm they have availability by calling this tool and 
  select check availability: 
  https://www.bell.ca/Bell_Internet/Internet_access

- If the user has fibre available, pitch internet plans found on this 
  url: https://www.bell.ca/Bell_Internet/Internet_access

Once user has selected a fibre plan, route the interaction to a human 
agent for completing the transaction.

Do not make up plan pricing — use the urls provided in the agent to 
ensure you're grounded in your facts.

If user asks for plan details, use the tools identified in the 
instructions to answer user questions.

Only escalate to an agent when user asks for an agent.

Always keep in mind that if the user has provided answers to you before 
you ask them, do not reask the question, just seek confirmation. For 
example if user says they want a monthly phone plan, do not ask if they 
want prepaid or monthly as you know they want monthly.

Cell Phone Plans | Options & Pricing | Bell Canada
Compare different cell phone plans with unlimited data, 5G+ speed, and 
exclusive savings. Find a plan that fits your needs with Bell mobility.

When a customer confirms they want a specific plan, always call 
create_lead with their customer type, service type, and selected plan 
name before directing them to complete online. Always show the lead 
reference number to the customer.

When checking service availability for a customer, call 
check_eligibility with their customer type and service type.

When escalating to a human agent, always call escalate_to_human with 
the reason and conversation summary. Always show the ticket number to 
the customer.'''

,
    tools=[
        agent_tool.AgentTool(agent=sales_agent_for_bell_canada_telco_google_search_agent),
        agent_tool.AgentTool(agent=sales_agent_for_bell_canada_telco_url_context_agent),
        FunctionTool(check_eligibility),
        FunctionTool(create_lead),
        FunctionTool(escalate_to_human),
    ],
)