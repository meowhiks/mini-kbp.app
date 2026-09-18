FROM httpd:2.4-alpine

RUN apk add --no-cache python3 openssl \
    && sed -i \
        -e 's/^#\(LoadModule proxy_module modules\/mod_proxy.so\)/\1/' \
        -e 's/^#\(LoadModule proxy_http_module modules\/mod_proxy_http.so\)/\1/' \
        -e 's/^#\(LoadModule proxy_wstunnel_module modules\/mod_proxy_wstunnel.so\)/\1/' \
        -e 's/^#\(LoadModule rewrite_module modules\/mod_rewrite.so\)/\1/' \
        -e 's/^#\(LoadModule headers_module modules\/mod_headers.so\)/\1/' \
        -e 's/^#\(LoadModule remoteip_module modules\/mod_remoteip.so\)/\1/' \
        -e 's/^#\(LoadModule ssl_module modules\/mod_ssl.so\)/\1/' \
        -e 's/^#\(LoadModule socache_shmcb_module modules\/mod_socache_shmcb.so\)/\1/' \
        /usr/local/apache2/conf/httpd.conf \
    && sed -i 's/#ServerName www.example.com:80/ServerName mini-kbp.site:80/' /usr/local/apache2/conf/httpd.conf \
    && printf '\nListen 443\n' >> /usr/local/apache2/conf/httpd.conf \
    && printf '\nInclude conf/extra/minikbp-global.conf\nInclude conf/extra/vhost-api.conf\nInclude conf/extra/vhost-www.conf\nInclude conf/extra/vhost-lk.conf\nInclude conf/extra/vhost-panel.conf\nInclude conf/extra/vhost-ssl.conf\n' >> /usr/local/apache2/conf/httpd.conf

COPY conf/minikbp-global.conf /usr/local/apache2/conf/extra/minikbp-global.conf
COPY conf/minikbp-common.conf /usr/local/apache2/conf/extra/minikbp-common.conf
COPY conf/minikbp-csp.conf /usr/local/apache2/conf/extra/minikbp-csp.conf
COPY conf/minikbp-ssl.conf /usr/local/apache2/conf/extra/minikbp-ssl.conf
COPY conf/vhost-api.conf /usr/local/apache2/conf/extra/vhost-api.conf
COPY conf/vhost-www.conf /usr/local/apache2/conf/extra/vhost-www.conf
COPY conf/vhost-lk.conf /usr/local/apache2/conf/extra/vhost-lk.conf
COPY conf/vhost-panel.conf /usr/local/apache2/conf/extra/vhost-panel.conf
COPY conf/vhost-ssl.conf /usr/local/apache2/conf/extra/vhost-ssl.conf
COPY errors/ /usr/local/apache2/htdocs/errors/
# Certs: prefer build context; compose also mounts ./docker/apache/certs for renewals
COPY certs/ /usr/local/apache2/certs/

EXPOSE 80 443
