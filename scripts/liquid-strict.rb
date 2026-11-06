# Parses every Liquid file with Shopify's reference parser in strict mode (what the theme sync enforces).
# Shopify-only tags (form, paginate, sections, section, style, schema...) are reported by the reference parser as unknown and ignored here.
#   gem install liquid && LC_ALL=C.UTF-8 ruby -Eutf-8:utf-8 scripts/liquid-strict.rb
require "liquid"
root = File.expand_path("..", __dir__)
bad = 0
Dir.glob("#{root}/{snippets,sections,layout}/*.liquid").sort.each do |f|
  src = File.read(f, encoding: "utf-8").sub(/\{% schema %\}.*\{% endschema %\}/m, "")
  begin
    Liquid::Template.parse(src, error_mode: :strict)
  rescue => e
    next if e.message =~ /Unknown tag '(form|paginate|sections?|style|javascript|stylesheet|layout)'/
    bad += 1
    puts "#{f.sub(root + '/', '')}: #{e.message[0, 200]}"
  end
end
puts bad.zero? ? "all Liquid files parse in strict mode" : "#{bad} file(s) would be rejected"
exit(bad.zero? ? 0 : 1)
