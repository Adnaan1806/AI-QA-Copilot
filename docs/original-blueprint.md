# AI QA Copilot Platform

> [!NOTE]
> This is the original blueprint the project started from, kept for history. The product is now **Testwright AI**, and the [README](../README.md) describes what it does today. Some choices here changed along the way: it runs on Gemini or Claude rather than OpenAI, and the performance-testing agent hasn't been built yet.


## Product Development Blueprint & Implementation Plan

Version: 1.0

---

# 1. Project Overview

## Product Name

AI QA Copilot

## Vision

Build an AI-powered QA Engineering platform that assists Software Testing teams throughout the entire QA lifecycle:

```
Requirement Analysis
        |
        |
Test Planning
        |
        |
Test Case Design
        |
        |
Automation Development
        |
        |
API Testing
        |
        |
Performance Testing
        |
        |
Reporting
```

The system should behave like an experienced QA Engineer who understands business requirements, identifies risks, creates test strategies, generates automation scripts, and provides quality insights.

---

# 2. Problem Statement

Modern QA engineers spend significant time performing repetitive activities:

- Understanding requirements
- Writing test scenarios
- Creating test cases
- Maintaining automation scripts
- Preparing test documentation
- Reviewing defects
- Creating test reports

The goal is to reduce manual effort using LLM-powered AI agents.

---

# 3. MVP Goal

The first version should focus on:

## Input

User uploads:

- User Story
- Requirement document
- Jira ticket
- Acceptance criteria

Example:

```
As a customer,
I want to reset my password,
so that I can regain access to my account.
```

---

## Output

AI generates:

1. Requirement Analysis

2. Missing Requirement Identification

3. Risk Analysis

4. Test Scenarios

5. Manual Test Cases

6. Test Coverage Report

---

# 4. Future Features

## Phase 2

Automation Generation:

- Playwright
- Selenium
- Cypress
- Robot Framework

## Phase 3

API Testing:

- Swagger import
- Postman collections
- REST Assured tests

## Phase 4

Performance Testing:

- JMeter
- K6 scripts

## Phase 5

Enterprise Integration:

- Jira
- Azure DevOps
- GitHub
- CI/CD pipelines

---

# 5. System Architecture

High-level architecture:

```
                 Frontend
              React + Tailwind

                    |
                    |

              Backend API
              FastAPI

                    |
                    |

        ----------------------------

        AI Orchestration Layer

        ----------------------------


          Requirement Agent

                  |

          QA Analyst Agent

                  |

        Automation Engineer Agent

                  |

        Performance Engineer Agent

                  |

             Report Agent


                    |

                    |

              Knowledge Layer

                    |

              Vector Database

                    |

        Company QA Documents

```

---

# 6. Technology Stack

## Frontend

Framework:

- React.js

Styling:

- Tailwind CSS

State Management:

- Zustand / Redux Toolkit

---

## Backend

Framework:

- Python FastAPI

Reason:

- Best AI ecosystem
- LangChain support
- Easy API development

---

## Database

Primary Database:

PostgreSQL

Purpose:

Store:

- Users
- Projects
- Requirements
- Generated tests
- Reports

---

## Vector Database

Initial:

ChromaDB

Future:

- Pinecone
- Weaviate

Purpose:

Store company QA knowledge.

---

# 7. AI Architecture

Do NOT use a single LLM prompt.

Create specialized AI agents.

---

# Agent 1: Requirement Analyst Agent

Role:

Act as Business Analyst + QA Lead.

Input:

```
User Story
Acceptance Criteria
Business Rules
```

Output:

```
Feature Analysis

Actors

Functional Requirements

Dependencies

Missing Information

Potential Risks
```

Example:

Missing:

```
- Maximum OTP attempts not defined
- Password complexity missing
- Error handling unclear
```

---

# Agent 2: QA Analyst Agent

Role:

Senior QA Engineer.

Input:

Requirement analysis

Output:

Generate:

- Test scenarios
- Functional tests
- Negative tests
- Edge cases
- Security tests

Example:

```
Scenario:

Reset password with expired OTP


Steps:

1. Request OTP
2. Wait until expiry
3. Enter OTP


Expected:

OTP rejected
```

---

# Agent 3: Automation Engineer Agent

Role:

SDET Engineer.

Input:

Approved test cases

Output:

Automation code:

Example:

Playwright:

```
test(
"Password reset",
async({page})=>{
...
}
)
```

Supported:

- Playwright
- Selenium
- Cypress

---

# Agent 4: Performance Engineer Agent

Role:

Performance tester.

Output:

Generate:

- Load scenarios
- Stress scenarios
- K6 scripts
- JMeter plans

---

# Agent 5: Report Agent

Role:

QA Manager.

Output:

Generate:

- Test summary
- Coverage analysis
- Quality risks
- Release recommendation

---

# 8. RAG Implementation

## Why RAG?

A normal LLM gives generic answers.

RAG allows the AI to learn from company knowledge.

---

# Knowledge Sources

Users upload:

```
/knowledge

test_cases.xlsx

bug_reports.csv

api_documentation.pdf

architecture_docs.pdf

coding_guidelines.docx

previous_requirements.pdf

```

---

# RAG Pipeline

```
Documents

     |

Document Loader

     |

Text Chunking

     |

Embedding Generation

     |

Vector Database

     |

Similarity Search

     |

LLM Context

     |

Generated Answer

```

---

# Embedding Process

Example:

Document:

```
OTP expires after 5 minutes
```

Converted into vector:

```
[0.234,0.562,0.983....]
```

Stored in ChromaDB.

---

# Query Example

New requirement:

```
Implement password reset
```

System searches:

```
Previous password bugs

Existing OTP tests

Security rules

API documentation
```

Then sends context to LLM.

---

# 9. Backend Structure

```
backend/

app/

 ├── main.py

 ├── api/

 │     ├── users.py

 │     ├── projects.py

 │     ├── documents.py


 ├── agents/

 │     ├── requirement_agent.py

 │     ├── qa_agent.py

 │     ├── automation_agent.py


 ├── rag/

 │     ├── embeddings.py

 │     ├── vector_store.py

 │     ├── retriever.py


 ├── llm/

 │     ├── openai_client.py


 ├── database/

 │     ├── models.py

 │     ├── connection.py


 └── services/

       ├── document_service.py

       ├── test_generation_service.py

```

---

# 10. Frontend Structure

```
frontend/

src/

 ├── pages/

 │     Dashboard.jsx

 │     UploadRequirement.jsx

 │     TestCases.jsx


 ├── components/

 │     ChatBox.jsx

 │     TestCaseTable.jsx

 │     AgentStatus.jsx


 ├── services/

 │     api.js

```

---

# 11. Database Design

## Users Table

```
id

name

email

password_hash

created_at

```

## Projects Table

```
id

user_id

project_name

created_at

```

## Requirements Table

```
id

project_id

content

analysis_result

created_at

```

## Test Cases Table

```
id

requirement_id

title

steps

expected_result

priority

```

---

# 12. Development Roadmap

# Sprint 1

Goal:

Basic AI Requirement Analyzer

Tasks:

- Setup FastAPI
- Connect OpenAI API
- Create upload endpoint
- Send requirement to LLM
- Return analysis

---

# Sprint 2

Goal:

RAG Implementation

Tasks:

- Add document upload
- Add PDF parser
- Create embeddings
- Setup ChromaDB
- Implement retrieval

---

# Sprint 3

Goal:

QA Agent

Tasks:

- Create QA prompts
- Generate test scenarios
- Generate test cases
- Store results

---

# Sprint 4

Goal:

Frontend Application

Tasks:

- React dashboard
- Upload interface
- Results display
- History

---

# Sprint 5

Goal:

Multi-Agent Workflow

Implement:

LangGraph

Flow:

```
Requirement Agent

        |

QA Agent

        |

Automation Agent

        |

Report Agent

```

---

# 13. Development Rules

When writing code:

1. Keep services modular.

2. Use environment variables.

3. Never hardcode API keys.

4. Use clean architecture.

5. Write unit tests.

6. Document APIs.

7. Build production-ready code.

---

# End Goal

Create an AI-powered QA Engineer platform capable of:

Understanding requirements

Generating tests

Creating automation

Executing tests

Analyzing quality risks

Helping teams ship reliable software faster.
