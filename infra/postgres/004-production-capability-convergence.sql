-- 004 Production Capability Convergence
INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('resource.read', 'Read managed resources', 'AUTO', 'platform'),
('resource.manage', 'Manage resources lifecycle', 'ADMIN_APPROVAL', 'platform'),
('affiliate.read', 'Read affiliate data', 'AUTO', 'platform'),
('affiliate.manage', 'Manage affiliates and conversions', 'AUTO', 'platform'),
('security.read', 'Read security configuration and events', 'AUTO', 'platform'),
('security.manage', 'Manage security and IP rules', 'ADMIN_APPROVAL', 'platform')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(id) VALUES ('004-production-capability-convergence') ON CONFLICT DO NOTHING;
