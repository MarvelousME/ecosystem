<?php
/**
 * Plugin Name: Bridge Connector
 * Description: Governed WordPress adapter for the Bridge Ecosystem capability plane.
 * Version: 1.1.0
 * Requires PHP: 8.1
 */
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function (): void {
    register_rest_route('bridge-connector/v1', '/health', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => static function () {
            return [
                'status' => 'healthy',
                'wordpress' => get_bloginfo('version'),
                'capabilities' => [
                    'website.page.read',
                    'website.page.update',
                    'website.media.upload',
                    'wordpress.plugin.list',
                ],
            ];
        },
    ]);

    register_rest_route('bridge-connector/v1', '/pages', [
        'methods' => 'GET',
        'permission_callback' => static function () {
            return current_user_can('edit_pages') || bridge_connector_service_auth();
        },
        'callback' => static function () {
            $pages = get_posts([
                'post_type' => 'page',
                'post_status' => ['publish', 'draft', 'private'],
                'numberposts' => 100,
            ]);
            return array_map(static function ($p) {
                return [
                    'id' => $p->ID,
                    'title' => $p->post_title,
                    'status' => $p->post_status,
                    'content' => $p->post_content,
                    'fields' => [
                        'phone' => bridge_connector_extract_phone($p->post_content),
                    ],
                ];
            }, $pages);
        },
    ]);

    register_rest_route('bridge-connector/v1', '/pages/apply', [
        'methods' => 'POST',
        'permission_callback' => static function () {
            return current_user_can('edit_pages') || bridge_connector_service_auth();
        },
        'callback' => static function (WP_REST_Request $request) {
            $changeset = $request->get_json_params()['changeset'] ?? [];
            $changes = $changeset['diff'] ?? $changeset['changes'] ?? [];
            $applied = [];
            foreach ($changes as $change) {
                if (($change['action'] ?? '') !== 'replace_phone') {
                    continue;
                }
                $pageId = isset($change['pageId']) ? (int) $change['pageId'] : 0;
                $to = (string) ($change['to'] ?? '');
                if ($pageId <= 0 || $to === '') {
                    continue;
                }
                $post = get_post($pageId);
                if (!$post) {
                    // Create draft contact page when none exist
                    $pageId = wp_insert_post([
                        'post_type' => 'page',
                        'post_title' => $change['title'] ?? 'Contact',
                        'post_status' => 'draft',
                        'post_content' => 'Contact us at ' . $to,
                    ]);
                    $applied[] = ['pageId' => $pageId, 'created' => true, 'phone' => $to];
                    continue;
                }
                $content = (string) $post->post_content;
                $from = (string) ($change['from'] ?? '');
                if ($from !== '' && str_contains($content, $from)) {
                    $content = str_replace($from, $to, $content);
                } else {
                    $content .= "\n\nPhone: " . $to;
                }
                wp_update_post([
                    'ID' => $pageId,
                    'post_content' => $content,
                    'post_status' => 'draft',
                ]);
                $applied[] = ['pageId' => $pageId, 'phone' => $to, 'status' => 'draft'];
            }
            return ['applied' => $applied, 'mode' => 'draft_only'];
        },
    ]);

    register_rest_route('bridge-connector/v1', '/plugins', [
        'methods' => 'GET',
        'permission_callback' => static function () {
            return current_user_can('activate_plugins') || bridge_connector_service_auth();
        },
        'callback' => static function () {
            if (!function_exists('get_plugins')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }
            $plugins = get_plugins();
            $out = [];
            foreach ($plugins as $file => $data) {
                $out[] = [
                    'file' => $file,
                    'name' => $data['Name'] ?? $file,
                    'version' => $data['Version'] ?? '',
                    'active' => is_plugin_active($file),
                ];
            }
            return $out;
        },
    ]);
});

function bridge_connector_service_auth(): bool
{
    $key = getenv('BRIDGE_CONNECTOR_KEY') ?: '';
    if ($key === '') {
        // Local compose: allow internal network reads without key for health-driven adapters
        $remote = $_SERVER['REMOTE_ADDR'] ?? '';
        return in_array($remote, ['127.0.0.1', '::1'], true) || str_starts_with($remote, '172.');
    }
    $provided = $_SERVER['HTTP_X_BRIDGE_CONNECTOR_KEY'] ?? '';
    return hash_equals($key, $provided);
}

function bridge_connector_extract_phone(string $content): ?string
{
    if (preg_match('/\+?\d[\d\-\s]{7,}\d/', $content, $m)) {
        return trim($m[0]);
    }
    return null;
}
