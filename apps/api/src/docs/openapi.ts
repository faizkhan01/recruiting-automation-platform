const objectId = {
  type: 'string',
  pattern: '^[a-fA-F0-9]{24}$',
  example: '507f1f77bcf86cd799439011'
} as const;

const timestamp = {
  type: 'string',
  format: 'date-time',
  example: '2026-06-25T12:00:00.000Z'
} as const;

const errorResponses = {
  400: {
    description: 'Invalid request or identifier',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  },
  404: {
    description: 'Resource not found',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  },
  429: {
    description: 'Rate limit exceeded. Inspect the RateLimit and Retry-After headers.',
    headers: {
      RateLimit: {
        description: 'Structured rate-limit policy and remaining quota',
        schema: { type: 'string' }
      },
      'Retry-After': {
        description: 'Seconds until another request should be attempted',
        schema: { type: 'integer' }
      }
    },
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  },
  500: {
    description: 'Unexpected server error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' }
      }
    }
  }
} as const;

const jsonBody = (schema: Record<string, unknown>, example?: Record<string, unknown>) => ({
  required: true,
  content: {
    'application/json': {
      schema,
      ...(example ? { example } : {})
    }
  }
});

const successResponse = (schema: Record<string, unknown>) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', const: true, example: true },
    data: schema
  }
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Recruiting Automation Platform API',
    version: '1.0.0',
    description:
      'REST API for managing jobs, sourcing candidates, AI scoring, automated outreach, task tracking, and candidate-response classification.'
  },
  servers: [
    {
      url: '/',
      description: 'Current server'
    }
  ],
  tags: [
    { name: 'System', description: 'Service health and metadata' },
    { name: 'Jobs', description: 'Job openings and candidate sourcing' },
    { name: 'Candidates', description: 'Candidate profiles and AI workflows' },
    { name: 'Tasks', description: 'Background task status' }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Check API health',
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'API is available',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'object',
                  required: ['status', 'timestamp'],
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp
                  }
                })
              }
            }
          }
        }
      }
    },
    '/api/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Create a job opening',
        operationId: 'createJob',
        requestBody: jsonBody(
          { $ref: '#/components/schemas/CreateJobInput' },
          {
            title: 'Lead MERN Engineer',
            department: 'Engineering',
            location: 'Remote',
            employmentType: 'full-time',
            description: 'Lead a team building reliable AI-powered recruiting products.',
            requirements: ['7+ years software engineering', 'Technical leadership'],
            skills: ['Node.js', 'TypeScript', 'React', 'MongoDB', 'Redis']
          }
        ),
        responses: {
          201: {
            description: 'Job created',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/Job' })
              }
            }
          },
          ...errorResponses
        }
      },
      get: {
        tags: ['Jobs'],
        summary: 'List all jobs',
        operationId: 'listJobs',
        responses: {
          200: {
            description: 'Jobs ordered newest first',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Job' }
                })
              }
            }
          },
          429: errorResponses[429],
          500: errorResponses[500]
        }
      }
    },
    '/api/jobs/external/search': {
      get: {
        tags: ['Jobs'],
        summary: 'Search public job listings with Serper',
        operationId: 'searchExternalJobs',
        parameters: [
          {
            name: 'query',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2, maxLength: 200 },
            example: 'Senior Node.js Engineer'
          },
          {
            name: 'location',
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 120 },
            example: 'Remote'
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
          }
        ],
        responses: {
          200: {
            description: 'Public job search results',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'array',
                  items: { $ref: '#/components/schemas/ExternalJobResult' }
                })
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/jobs/import-external': {
      post: {
        tags: ['Jobs'],
        summary: 'Import a public job listing',
        description: 'Creates a normal recruiting job while preserving its external source URL.',
        operationId: 'importExternalJob',
        requestBody: jsonBody(
          { $ref: '#/components/schemas/ImportExternalJobInput' },
          {
            title: 'Senior Node.js Engineer',
            company: 'Acme Labs',
            location: 'Remote',
            description: 'Build production Node.js and TypeScript services.',
            sourceUrl: 'https://www.linkedin.com/jobs/view/123456789'
          }
        ),
        responses: {
          201: {
            description: 'External job imported',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/Job' })
              }
            }
          },
          409: {
            description: 'The source URL was already imported',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Get job details',
        operationId: 'getJob',
        parameters: [{ $ref: '#/components/parameters/JobId' }],
        responses: {
          200: {
            description: 'Job details',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/Job' })
              }
            }
          },
          ...errorResponses
        }
      },
      patch: {
        tags: ['Jobs'],
        summary: 'Update a manually created job',
        description: 'Imported Serper jobs are read-only. Only supplied fields are changed.',
        operationId: 'updateJob',
        parameters: [{ $ref: '#/components/parameters/JobId' }],
        requestBody: jsonBody(
          { $ref: '#/components/schemas/UpdateJobInput' },
          {
            title: 'Lead Platform Engineer',
            status: 'open',
            skills: ['Node.js', 'TypeScript', 'MongoDB']
          }
        ),
        responses: {
          200: {
            description: 'Job updated',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/Job' })
              }
            }
          },
          409: {
            description: 'The job is imported and read-only',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          ...errorResponses
        }
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Delete a manually created job',
        description:
          'Removes job-specific scores, messages, completed tasks, and candidate associations. Deletion is blocked while a task is queued or active.',
        operationId: 'deleteJob',
        parameters: [{ $ref: '#/components/parameters/JobId' }],
        responses: {
          200: {
            description: 'Job deleted',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'object',
                  properties: {
                    deletedJobId: objectId,
                    detachedCandidates: { type: 'integer', minimum: 0 },
                    deletedOrphanCandidates: { type: 'integer', minimum: 0 }
                  }
                })
              }
            }
          },
          409: {
            description: 'Imported job or active background task prevents deletion',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/jobs/{jobId}/sourcing-tasks': {
      post: {
        tags: ['Jobs'],
        summary: 'Queue candidate sourcing',
        description:
          'Creates a non-blocking BullMQ task. Poll the returned task ID until it reaches completed or failed.',
        operationId: 'createSourcingTask',
        parameters: [{ $ref: '#/components/parameters/JobIdNamed' }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SourcingTaskInput' },
              example: { query: 'Lead Node.js Engineer Remote', limit: 10 }
            }
          }
        },
        responses: {
          202: {
            description: 'Sourcing task queued',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/QueuedTask' })
              }
            }
          },
          409: {
            description: 'Job is closed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/jobs/{jobId}/candidates': {
      get: {
        tags: ['Jobs'],
        summary: 'List candidates for a job',
        description: 'Returns candidates with their latest score for this job when available.',
        operationId: 'listJobCandidates',
        parameters: [{ $ref: '#/components/parameters/JobIdNamed' }],
        responses: {
          200: {
            description: 'Candidates associated with the job',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'array',
                  items: { $ref: '#/components/schemas/CandidateWithLatestScore' }
                })
              }
            }
          },
          400: errorResponses[400],
          429: errorResponses[429],
          500: errorResponses[500]
        }
      }
    },
    '/api/tasks/{taskId}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get background task status',
        operationId: 'getTask',
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'task_507f1f77bcf86cd799439011'
          }
        ],
        responses: {
          200: {
            description: 'Current task state',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/AutomationTask' })
              }
            }
          },
          404: errorResponses[404],
          429: errorResponses[429],
          500: errorResponses[500]
        }
      }
    },
    '/api/candidates': {
      get: {
        tags: ['Candidates'],
        summary: 'List candidates',
        description: 'Returns up to 200 globally deduplicated candidates.',
        operationId: 'listCandidates',
        parameters: [
          {
            name: 'jobId',
            in: 'query',
            required: false,
            description: 'Optionally filter candidates by associated job',
            schema: objectId
          }
        ],
        responses: {
          200: {
            description: 'Candidate list',
            content: {
              'application/json': {
                schema: successResponse({
                  type: 'array',
                  items: { $ref: '#/components/schemas/CandidateWithLatestScore' }
                })
              }
            }
          },
          429: errorResponses[429],
          500: errorResponses[500]
        }
      }
    },
    '/api/candidates/{id}': {
      get: {
        tags: ['Candidates'],
        summary: 'Get candidate details',
        description: 'Includes associated jobs, scoring history, outreach messages, and responses.',
        operationId: 'getCandidate',
        parameters: [{ $ref: '#/components/parameters/CandidateId' }],
        responses: {
          200: {
            description: 'Candidate details',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/CandidateDetails' })
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/candidates/{id}/scores': {
      post: {
        tags: ['Candidates'],
        summary: 'Score a candidate against a job',
        description:
          'Uses the configured AI provider and Redis cache, then persists the result in MongoDB.',
        operationId: 'scoreCandidate',
        parameters: [{ $ref: '#/components/parameters/CandidateId' }],
        requestBody: jsonBody(
          { $ref: '#/components/schemas/JobReferenceInput' },
          { jobId: '507f1f77bcf86cd799439011' }
        ),
        responses: {
          200: {
            description: 'Candidate score',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/CandidateScore' })
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/candidates/{id}/outreach': {
      post: {
        tags: ['Candidates'],
        summary: 'Queue personalized candidate outreach',
        description: 'Queues AI message generation and simulated delivery in the worker process.',
        operationId: 'createOutreachTask',
        parameters: [{ $ref: '#/components/parameters/CandidateId' }],
        requestBody: jsonBody(
          { $ref: '#/components/schemas/JobReferenceInput' },
          { jobId: '507f1f77bcf86cd799439011' }
        ),
        responses: {
          202: {
            description: 'Outreach task queued',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/QueuedTask' })
              }
            }
          },
          ...errorResponses
        }
      }
    },
    '/api/candidates/{id}/responses': {
      post: {
        tags: ['Candidates'],
        summary: 'Classify a candidate response',
        description:
          'Classifies interested/not-interested intent and creates a mock scheduling link for interested candidates.',
        operationId: 'classifyCandidateResponse',
        parameters: [{ $ref: '#/components/parameters/CandidateId' }],
        requestBody: jsonBody(
          {
            type: 'object',
            required: ['message'],
            properties: {
              message: { type: 'string', minLength: 1, maxLength: 5000 }
            }
          },
          { message: "Yes, I'm interested and would love to learn more." }
        ),
        responses: {
          201: {
            description: 'Response classified',
            content: {
              'application/json': {
                schema: successResponse({ $ref: '#/components/schemas/CandidateResponse' })
              }
            }
          },
          ...errorResponses
        }
      }
    }
  },
  components: {
    parameters: {
      JobId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'MongoDB job identifier',
        schema: objectId
      },
      JobIdNamed: {
        name: 'jobId',
        in: 'path',
        required: true,
        description: 'MongoDB job identifier',
        schema: objectId
      },
      CandidateId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'MongoDB candidate identifier',
        schema: objectId
      }
    },
    schemas: {
      CreateJobInput: {
        type: 'object',
        required: ['title', 'location', 'description'],
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 120 },
          department: { type: 'string', maxLength: 100 },
          company: { type: 'string', maxLength: 160 },
          location: { type: 'string', minLength: 2, maxLength: 120 },
          employmentType: {
            type: 'string',
            enum: ['full-time', 'part-time', 'contract', 'internship'],
            default: 'full-time'
          },
          description: { type: 'string', minLength: 20, maxLength: 10000 },
          requirements: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1 },
            default: []
          },
          skills: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1 },
            default: []
          }
        }
      },
      UpdateJobInput: {
        type: 'object',
        minProperties: 1,
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 120 },
          department: { type: 'string', maxLength: 100 },
          location: { type: 'string', minLength: 2, maxLength: 120 },
          employmentType: {
            type: 'string',
            enum: ['full-time', 'part-time', 'contract', 'internship']
          },
          description: { type: 'string', minLength: 20, maxLength: 10000 },
          requirements: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1 }
          },
          skills: {
            type: 'array',
            maxItems: 30,
            items: { type: 'string', minLength: 1 }
          },
          status: { type: 'string', enum: ['open', 'closed'] }
        }
      },
      Job: {
        allOf: [
          { $ref: '#/components/schemas/CreateJobInput' },
          {
            type: 'object',
            required: ['_id', 'status', 'createdAt', 'updatedAt'],
            properties: {
              _id: objectId,
              status: { type: 'string', enum: ['open', 'closed'] },
              source: { type: 'string', enum: ['manual', 'serper'], default: 'manual' },
              sourceUrl: { type: 'string', format: 'uri' },
              importedAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp
            }
          }
        ]
      },
      ExternalJobResult: {
        type: 'object',
        required: [
          'externalId',
          'title',
          'description',
          'source',
          'sourceName',
          'sourceUrl'
        ],
        properties: {
          externalId: { type: 'string' },
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          description: { type: 'string' },
          source: { type: 'string', const: 'serper' },
          sourceName: { type: 'string', example: 'LinkedIn' },
          sourceUrl: { type: 'string', format: 'uri' },
          postedAt: { type: 'string' }
        }
      },
      ImportExternalJobInput: {
        type: 'object',
        required: ['title', 'description', 'sourceUrl'],
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 200 },
          company: { type: 'string', maxLength: 160 },
          location: { type: 'string', maxLength: 160, default: 'Not specified' },
          description: { type: 'string', minLength: 10, maxLength: 10000 },
          sourceUrl: { type: 'string', format: 'uri', maxLength: 2000 },
          employmentType: {
            type: 'string',
            enum: ['full-time', 'part-time', 'contract', 'internship'],
            default: 'full-time'
          },
          requirements: { type: 'array', items: { type: 'string' }, default: [] },
          skills: { type: 'array', items: { type: 'string' }, default: [] }
        }
      },
      SourcingTaskInput: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            minLength: 2,
            maxLength: 300,
            description: 'Defaults to a query generated from the job'
          },
          limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 }
        }
      },
      JobReferenceInput: {
        type: 'object',
        required: ['jobId'],
        properties: { jobId: objectId }
      },
      Candidate: {
        type: 'object',
        required: [
          '_id',
          'jobIds',
          'name',
          'linkedinUrl',
          'skills',
          'source',
          'status',
          'createdAt',
          'updatedAt'
        ],
        properties: {
          _id: objectId,
          jobIds: { type: 'array', items: objectId },
          name: { type: 'string' },
          headline: { type: 'string' },
          location: { type: 'string' },
          linkedinUrl: { type: 'string', format: 'uri' },
          profileUrl: { type: 'string', format: 'uri' },
          summary: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          experienceYears: { type: 'number', minimum: 0, maximum: 80 },
          source: { type: 'string', example: 'demo' },
          status: {
            type: 'string',
            enum: ['sourced', 'contacted', 'interested', 'not_interested']
          },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      CandidateWithLatestScore: {
        allOf: [
          { $ref: '#/components/schemas/Candidate' },
          {
            type: 'object',
            properties: {
              latestScore: {
                oneOf: [{ $ref: '#/components/schemas/CandidateScore' }, { type: 'null' }]
              }
            }
          }
        ]
      },
      CandidateScore: {
        type: 'object',
        required: [
          '_id',
          'candidateId',
          'jobId',
          'score',
          'reasoning',
          'strengths',
          'gaps',
          'recommendation',
          'model'
        ],
        properties: {
          _id: objectId,
          candidateId: objectId,
          jobId: objectId,
          score: { type: 'number', minimum: 0, maximum: 100, example: 87 },
          reasoning: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
          recommendation: {
            type: 'string',
            enum: ['strong_match', 'potential_match', 'weak_match']
          },
          model: { type: 'string', example: 'gemini-3.1-flash-lite' },
          cached: { type: 'boolean' },
          cacheHit: { type: 'boolean' },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      OutreachMessage: {
        type: 'object',
        properties: {
          _id: objectId,
          candidateId: objectId,
          jobId: objectId,
          taskId: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
          provider: { type: 'string' },
          attempts: { type: 'integer' },
          error: { type: 'string' },
          sentAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      CandidateResponse: {
        type: 'object',
        required: ['_id', 'candidateId', 'message', 'intent', 'confidence', 'reasoning'],
        properties: {
          _id: objectId,
          candidateId: objectId,
          message: { type: 'string' },
          intent: { type: 'string', enum: ['interested', 'not_interested'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          schedulingLink: { type: 'string', format: 'uri' },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      CandidateDetails: {
        allOf: [
          { $ref: '#/components/schemas/Candidate' },
          {
            type: 'object',
            required: ['jobs', 'scores', 'messages', 'responses'],
            properties: {
              jobs: { type: 'array', items: { $ref: '#/components/schemas/Job' } },
              scores: {
                type: 'array',
                items: { $ref: '#/components/schemas/CandidateScore' }
              },
              messages: {
                type: 'array',
                items: { $ref: '#/components/schemas/OutreachMessage' }
              },
              responses: {
                type: 'array',
                items: { $ref: '#/components/schemas/CandidateResponse' }
              }
            }
          }
        ]
      },
      QueuedTask: {
        type: 'object',
        required: ['taskId', 'status'],
        properties: {
          taskId: { type: 'string', example: 'task_507f1f77bcf86cd799439011' },
          status: { type: 'string', const: 'queued' }
        }
      },
      AutomationTask: {
        type: 'object',
        required: ['taskId', 'type', 'status', 'progress', 'attempts'],
        properties: {
          taskId: { type: 'string' },
          type: { type: 'string', enum: ['sourcing', 'outreach'] },
          status: { type: 'string', enum: ['queued', 'active', 'completed', 'failed'] },
          jobId: objectId,
          candidateId: objectId,
          progress: { type: 'number', minimum: 0, maximum: 100 },
          result: { type: 'object', additionalProperties: true },
          error: { type: 'string' },
          attempts: { type: 'integer', minimum: 0 },
          startedAt: timestamp,
          completedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', const: false, example: false },
          error: {
            type: 'object',
            required: ['message'],
            properties: {
              message: { type: 'string', example: 'Validation failed' },
              details: {}
            }
          }
        }
      }
    }
  }
} as const;
