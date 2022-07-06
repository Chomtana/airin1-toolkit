while read -r subdomain; do
	curl http://lt.airin1.com/api/fixport/$subdomain/$1
done < ../localtunnel-healthcheck/subdomain